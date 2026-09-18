import { createHash } from 'node:crypto';

export class MigrationError extends Error {}
const table = (name, definition, primaryKey = 'id', unique = []) => ({
  name, primaryKey, unique,
  columns: definition.split(' ').map((entry) => { const [name, declaration = 'text'] = entry.split(':'); return { name, type: declaration.replace('?', ''), nullable: declaration.endsWith('?') }; }),
});
export const TABLES = [
  table('institutions', 'id name is_demo:int created_at:instant'),
  table('users', 'id institution_id name email:text? password_hash:text? role student_id:text? created_at:instant', 'id', [['email']]),
  table('sessions', 'token_hash user_id role expires_at:instant settings:json', 'token_hash'),
  table('classrooms', 'id institution_id name grade teacher_name teacher_user_id:text? created_at:instant'),
  table('students', 'id institution_id classroom_id:text? name avatar grade code_hash:text? consent_audio:int created_at:instant', 'id', [['code_hash']]),
  table('activities', 'id institution_id title body:json status version:int created_at:instant'),
  table('activity_versions', 'id activity_id version:int body:json created_at:instant', 'id', [['activity_id', 'version']]),
  table('submissions', 'id institution_id student_id activity_id activity_version:int score:int correct:int total:int xp_earned:int answers:json fingerprint completed_at:instant duration_seconds:int is_diagnostic:int'),
  table('xp_awards', 'id student_id activity_id submission_id xp:int', 'id', [['student_id', 'activity_id']]),
  table('assignments', 'id institution_id classroom_id activity_id title due_date:date created_at:instant'),
  table('notes', 'id institution_id student_id text type author created_at:instant'),
  table('notifications', 'id institution_id student_id:text? title text read:int created_at:instant'),
  table('recordings', 'id institution_id student_id activity_id object_key mime_type size:int created_at:instant'),
  table('audit_logs', 'id institution_id user_id action detail created_at:instant'),
  table('rate_limits', 'key count:int reset_at:int', 'key'),
];
export const TABLE_BY_NAME = new Map(TABLES.map((entry) => [entry.name, entry]));
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const quoteIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) throw new MigrationError('Identificador PostgreSQL invalido.');
  return '"' + value + '"';
};
export function validateSchemaName(schema) {
  quoteIdentifier(schema);
  if (schema === 'public' || schema === 'information_schema' || schema.startsWith('pg_')) throw new MigrationError('Use um schema dedicado para Letria, diferente dos schemas compartilhados ou de sistema.');
  return schema;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
export function canonicalRow(spec, row) {
  const result = {};
  for (const column of spec.columns) {
    let value = row[column.name];
    if (value === undefined || value === null) {
      if (!column.nullable || value === undefined) throw new MigrationError('Coluna obrigatoria ausente: ' + spec.name + '.' + column.name);
      result[column.name] = null;
      continue;
    }
    try {
      if (column.type === 'json') value = JSON.stringify(stable(typeof value === 'string' ? JSON.parse(value) : value));
      else if (column.type === 'instant') {
        value = new Date(value).toISOString();
      } else if (column.type === 'date') {
        value = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error();
      } else if (column.type === 'int') {
        if (value === '' || typeof value === 'boolean') throw new Error();
        value = Number(value);
        if (!Number.isSafeInteger(value)) throw new Error();
      } else if (typeof value !== 'string') throw new Error();
      if (value === undefined) throw new Error();
      result[column.name] = value;
    } catch {
      throw new MigrationError('Dado invalido em ' + spec.name + '.' + column.name + '; valores pessoais omitidos.');
    }
  }
  return result;
}
export const equalRows = (left, right) => JSON.stringify(left) === JSON.stringify(right);
export const emptyDataset = () => Object.fromEntries(TABLES.map(({ name }) => [name, []]));
const rowLabel = (spec, row) => spec.name + ' / referencia ' + sha256(String(row[spec.primaryKey])).slice(0, 12);
export function mergeDatasets(datasets) {
  const result = emptyDataset();
  const summary = Object.fromEntries(TABLES.map(({ name }) => [name, { unique: 0, duplicates: 0, operationalMerges: 0 }]));
  for (const spec of TABLES) {
    const rows = new Map();
    for (const data of datasets) {
      for (const original of data[spec.name] || []) {
        const row = canonicalRow(spec, original);
        const previous = rows.get(row[spec.primaryKey]);
        if (!previous) rows.set(row[spec.primaryKey], row);
        else if (equalRows(previous, row)) summary[spec.name].duplicates++;
        else if (spec.name === 'rate_limits') {
          rows.set(row.key, { key: row.key, count: Math.max(previous.count, row.count), reset_at: Math.max(previous.reset_at, row.reset_at) });
          summary[spec.name].operationalMerges++;
        } else {
          const changed = spec.columns.filter(({ name }) => previous[name] !== row[name]).map(({ name }) => name);
          throw new MigrationError('Conflito de dados: ' + rowLabel(spec, row) + '; colunas: ' + changed.join(', ') + '. Nenhum registro foi sobrescrito.');
        }
      }
    }
    result[spec.name] = [...rows.values()].sort((a, b) => String(a[spec.primaryKey]).localeCompare(String(b[spec.primaryKey]), 'en'));
    summary[spec.name].unique = rows.size;
    for (const columns of spec.unique) {
      const values = new Set();
      for (const row of rows.values()) {
        if (columns.some((column) => row[column] === null)) continue;
        const key = JSON.stringify(columns.map((column) => row[column]));
        if (values.has(key)) throw new MigrationError('Conflito de unicidade: ' + spec.name + '(' + columns.join(', ') + '). Nenhum registro foi sobrescrito.');
        values.add(key);
      }
    }
  }
  return { data: result, summary };
}
export function validateDataset(data) {
  const ids = Object.fromEntries(TABLES.map((spec) => [spec.name, new Set(data[spec.name].map((row) => row[spec.primaryKey]))]));
  const foreignKeys = [
    ...['users', 'classrooms', 'students', 'activities', 'submissions', 'assignments', 'notes', 'notifications', 'recordings', 'audit_logs'].map((name) => [name, 'institution_id', 'institutions']),
    ['users', 'student_id', 'students'], ['sessions', 'user_id', 'users'], ['classrooms', 'teacher_user_id', 'users'],
    ['students', 'classroom_id', 'classrooms'], ['activity_versions', 'activity_id', 'activities'],
    ...['submissions', 'xp_awards', 'notes', 'recordings'].map((name) => [name, 'student_id', 'students']),
    ['xp_awards', 'submission_id', 'submissions'], ['assignments', 'classroom_id', 'classrooms'],
  ];
  for (const [name, column, parent] of foreignKeys) {
    for (const row of data[name]) if (row[column] !== null && !ids[parent].has(row[column])) throw new MigrationError('Referencia ausente: ' + name + '.' + column + ' -> ' + parent + '; valores pessoais omitidos.');
  }
  const allowedRoles = ['admin', 'teacher', 'guardian', 'student'];
  const checks = {
    institutions: (r) => [0, 1].includes(r.is_demo),
    users: (r) => allowedRoles.includes(r.role),
    sessions: (r) => allowedRoles.includes(r.role),
    students: (r) => [0, 1].includes(r.consent_audio),
    activities: (r) => ['draft', 'published'].includes(r.status) && r.version > 0,
    activity_versions: (r) => r.version > 0,
    submissions: (r) => r.score >= 0 && r.score <= 100 && r.total > 0 && r.correct >= 0 && r.correct <= r.total && r.xp_earned >= 0 && r.duration_seconds >= 0 && r.activity_version > 0 && [0, 1].includes(r.is_diagnostic),
    xp_awards: (r) => r.xp >= 0,
    notes: (r) => ['observation', 'intervention'].includes(r.type),
    notifications: (r) => [0, 1].includes(r.read),
    recordings: (r) => r.size >= 0,
    rate_limits: (r) => r.count >= 0 && r.reset_at >= 0,
  };
  for (const [name, predicate] of Object.entries(checks)) for (const row of data[name]) if (!predicate(row)) throw new MigrationError('Dado fora das restricoes PostgreSQL: ' + rowLabel(TABLE_BY_NAME.get(name), row));
}
export function datasetManifest(data) {
  return Object.fromEntries(TABLES.map(({ name }) => [name, { rows: data[name].length, sha256: sha256(JSON.stringify(data[name])) }]));
}
export function buildImportPlan(target, source) {
  const combined = mergeDatasets([target, source]);
  validateDataset(combined.data);
  const tables = {};
  for (const spec of TABLES) {
    const existing = new Map(target[spec.name].map((row) => [row[spec.primaryKey], canonicalRow(spec, row)]));
    const incoming = new Set(source[spec.name].map((row) => row[spec.primaryKey]));
    const inserts = [], updates = [], verify = [];
    for (const row of combined.data[spec.name]) {
      if (!incoming.has(row[spec.primaryKey])) continue;
      verify.push(row);
      const previous = existing.get(row[spec.primaryKey]);
      if (!previous) inserts.push(row);
      else if (!equalRows(previous, row)) {
        if (spec.name !== 'rate_limits') throw new MigrationError('Atualizacao nao autorizada em ' + spec.name);
        updates.push(row);
      }
    }
    tables[spec.name] = { inserts, updates, verify, existing: existing.size, duplicates: verify.length - inserts.length - updates.length };
  }
  return { tables, merged: combined.data };
}
