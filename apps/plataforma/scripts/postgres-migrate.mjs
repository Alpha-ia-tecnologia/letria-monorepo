import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import pg from 'pg';
import { TABLES, MigrationError, sha256, quoteIdentifier, validateSchemaName, canonicalRow, equalRows, emptyDataset, mergeDatasets, validateDataset, datasetManifest, buildImportPlan } from './postgres-migration-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let apply = false, explicitlyDry = false, envFile = path.join(root, '.env.postgres.local');
const sourcePaths = [];
for (let index = 0; index < args.length; index++) {
  const argument = args[index];
  if (argument === '--help') {
    console.log('node scripts/postgres-migrate.mjs [--dry-run | --apply] [--sqlite caminho.sqlite]... [--env arquivo]');
    console.log('Padrao: simulacao somente leitura no PostgreSQL. Credenciais: DATABASE_URL e DATABASE_SCHEMA em .env.postgres.local.');
    process.exit(0);
  }
  if (argument === '--apply') apply = true;
  else if (argument === '--dry-run') explicitlyDry = true;
  else if (argument === '--sqlite' || argument === '--env') {
    const value = args[++index];
    if (!value || value.startsWith('--')) { console.error('Informe o caminho apos ' + argument + '.'); process.exit(1); }
    if (argument === '--sqlite') sourcePaths.push(path.resolve(value)); else envFile = path.resolve(value);
  } else { console.error('Argumento desconhecido. Use --help.'); process.exit(1); }
}
if (apply && explicitlyDry) { console.error('Escolha --dry-run ou --apply.'); process.exit(1); }
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const runDirectory = path.join(root, 'work', 'migrations', runId);
let client;
let inTransaction = false;
let manifest;
async function writePrivate(filename, content) { await fs.writeFile(filename, content, { mode: 0o600, flag: 'wx' }); }
async function saveManifest() { if (manifest) await fs.writeFile(path.join(runDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 }); }
async function readSources() {
  const datasets = [];
  for (const [index, sourcePath] of [...new Set(sourcePaths)].entries()) {
    const info = await fs.stat(sourcePath);
    if (!info.isFile()) throw new MigrationError('A origem SQLite precisa ser um arquivo.');
    const snapshotName = 'source-' + (index + 1) + '.sqlite';
    const snapshotPath = path.join(runDirectory, snapshotName);
    const original = new DatabaseSync(sourcePath, { readOnly: true });
    try { await backup(original, snapshotPath); } finally { original.close(); }
    const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
    const data = emptyDataset();
    const compatibility = [];
    try {
      const integrity = snapshot.prepare('PRAGMA integrity_check').all();
      if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new MigrationError('Verificacao de integridade SQLite falhou; origem ' + (index + 1));
      if (snapshot.prepare('PRAGMA foreign_key_check').all().length) throw new MigrationError('Chaves estrangeiras invalidas no SQLite; origem ' + (index + 1));
      const tables = new Set(snapshot.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map((row) => row.name));
      for (const spec of TABLES) {
        if (!tables.has(spec.name)) throw new MigrationError('Tabela SQLite ausente: ' + spec.name + '; origem ' + (index + 1));
        const actual = snapshot.prepare('PRAGMA table_info(' + quoteIdentifier(spec.name) + ')').all().map((column) => column.name);
        const known = new Set(spec.columns.map(({ name }) => name));
        if (actual.some((column) => !known.has(column))) throw new MigrationError('Colunas SQLite desconhecidas em ' + spec.name + '; atualize o migrador para nao perder dados.');
        const missing = spec.columns.filter(({ name }) => !actual.includes(name));
        if (missing.some(({ name }) => spec.name !== 'classrooms' || name !== 'teacher_user_id')) throw new MigrationError('Esquema SQLite incompleto em ' + spec.name);
        if (missing.length) compatibility.push('classrooms.teacher_user_id: NULL para origem anterior a migracao SQLite 0001');
        data[spec.name] = snapshot.prepare('SELECT * FROM ' + quoteIdentifier(spec.name)).all().map((row) => canonicalRow(spec, { ...(missing.length ? { teacher_user_id: null } : {}), ...row }));
      }
    } finally { snapshot.close(); }
    const normalized = mergeDatasets([data]).data;
    validateDataset(normalized);
    const snapshotHash = sha256(await fs.readFile(snapshotPath));
    manifest.sources.push({ source: path.relative(root, sourcePath).replaceAll('\\', '/'), snapshot: snapshotName, snapshotSha256: snapshotHash, integrity: 'ok', foreignKeyViolations: 0, compatibility, tables: datasetManifest(normalized) });
    datasets.push(normalized);
  }
  const merged = mergeDatasets(datasets);
  validateDataset(merged.data);
  manifest.sourceMerge = merged.summary;
  manifest.sourceTables = datasetManifest(merged.data);
  return merged.data;
}
async function targetTables(schema) {
  return (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name", [schema])).rows.map((row) => row.table_name);
}
async function readTarget(schema, present) {
  const data = emptyDataset();
  for (const spec of TABLES) {
    if (!present.includes(spec.name)) continue;
    const columns = spec.columns.map(({ name }) => quoteIdentifier(name)).join(',');
    const result = await client.query('SELECT ' + columns + ' FROM ' + quoteIdentifier(schema) + '.' + quoteIdentifier(spec.name));
    data[spec.name] = result.rows.map((row) => canonicalRow(spec, row));
  }
  return mergeDatasets([data]).data;
}
function summaryFor(plan) {
  return Object.fromEntries(TABLES.map(({ name }) => [name, { before: plan.tables[name].existing, insert: plan.tables[name].inserts.length, identical: plan.tables[name].duplicates, operationalUpdate: plan.tables[name].updates.length, verify: plan.tables[name].verify.length }]));
}
async function loadMigrations() {
  const directory = path.join(root, 'postgres', 'migrations');
  const names = (await fs.readdir(directory)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!names.length) throw new MigrationError('Nenhuma migracao SQL encontrada.');
  return Promise.all(names.map(async (name) => { const sql = await fs.readFile(path.join(directory, name), 'utf8'); return { id: name, sql, checksum: sha256(sql) }; }));
}
async function verifyImported(schema, plan) {
  const verified = {};
  for (const spec of TABLES) {
    const expected = plan.tables[spec.name].verify;
    const received = [];
    const columns = spec.columns.map(({ name }) => quoteIdentifier(name)).join(',');
    for (let offset = 0; offset < expected.length; offset += 500) {
      const batch = expected.slice(offset, offset + 500);
      const result = await client.query('SELECT ' + columns + ' FROM ' + quoteIdentifier(schema) + '.' + quoteIdentifier(spec.name) + ' WHERE ' + quoteIdentifier(spec.primaryKey) + '=ANY($1::text[])', [batch.map((row) => row[spec.primaryKey])]);
      const actual = new Map(result.rows.map((row) => { const normalized = canonicalRow(spec, row); return [normalized[spec.primaryKey], normalized]; }));
      for (const row of batch) {
        const saved = actual.get(row[spec.primaryKey]);
        if (!saved || !equalRows(row, saved)) throw new MigrationError('Verificacao completa divergente em ' + spec.name + '; transacao revertida.');
        received.push(saved);
      }
    }
    verified[spec.name] = { rows: received.length, sha256: sha256(JSON.stringify(received)), allColumnsMatch: true };
  }
  return verified;
}
async function main() {
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new MigrationError('DATABASE_URL ausente; configure .env.postgres.local.');
  let address;
  try { address = new URL(connectionString); } catch { throw new MigrationError('DATABASE_URL invalida; credenciais omitidas.'); }
  if (!['postgres:', 'postgresql:'].includes(address.protocol)) throw new MigrationError('DATABASE_URL precisa usar PostgreSQL.');
  const schema = validateSchemaName(process.env.DATABASE_SCHEMA || 'letria');
  await fs.mkdir(runDirectory, { recursive: true, mode: 0o700 });
  manifest = { id: runId, mode: apply ? 'apply' : 'dry-run', startedAt: new Date().toISOString(), status: 'preparing', schema, sources: [], warnings: ['Arquivos de backup locais contem dados pessoais e hashes de autenticacao; work/ permanece ignorado no Git.', 'Rate limits duplicados usam o maior count e reset_at para preservar a protecao operacional.'] };
  const migrations = await loadMigrations();
  const source = await readSources();
  await saveManifest();
  client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, application_name: 'letria-migration', types: { getTypeParser: (oid, format) => [114, 3802, 1082, 1184].includes(oid) ? (value) => value : pg.types.getTypeParser(oid, format) } });
  await client.connect();
  await client.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  inTransaction = true;
  await client.query("SET LOCAL lock_timeout = '15s'");
  await client.query("SET LOCAL statement_timeout = '120s'");
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  if (apply) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['letria-migration:' + schema]);
  let present = await targetTables(schema);
  const history = present.includes('schema_migrations') ? (await client.query('SELECT id, checksum FROM ' + quoteIdentifier(schema) + '.schema_migrations ORDER BY id')).rows : [];
  for (const recorded of history) {
    const known = migrations.find(({ id }) => id === recorded.id);
    if (!known || known.checksum !== recorded.checksum) throw new MigrationError('Historico/checksum de migracao divergente; nenhuma alteracao aplicada.');
  }
  const pending = migrations.filter(({ id }) => !history.some((recorded) => recorded.id === id));
  if (!history.length && present.length) throw new MigrationError('O schema de destino ja contem tabelas sem historico reconhecido; use um schema dedicado vazio.');
  if (history.length && TABLES.some(({ name }) => !present.includes(name))) throw new MigrationError('Schema PostgreSQL incompleto apesar do historico; nenhuma alteracao aplicada.');
  if (apply && present.length) await client.query('LOCK TABLE ' + TABLES.map(({ name }) => quoteIdentifier(schema) + '.' + quoteIdentifier(name)).join(', ') + ' IN SHARE ROW EXCLUSIVE MODE');
  const before = await readTarget(schema, present);
  const plan = buildImportPlan(before, source);
  manifest.pendingMigrations = pending.map(({ id, checksum }) => ({ id, checksum }));
  manifest.targetBefore = datasetManifest(before);
  manifest.plan = summaryFor(plan);
  if (apply) {
    await writePrivate(path.join(runDirectory, 'target-before.json'), JSON.stringify(before) + '\n');
    await client.query('CREATE SCHEMA IF NOT EXISTS ' + quoteIdentifier(schema));
    await client.query('SET LOCAL search_path TO ' + quoteIdentifier(schema) + ', pg_catalog');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query("CREATE TABLE IF NOT EXISTS migration_runs (id text PRIMARY KEY, started_at timestamptz NOT NULL, completed_at timestamptz NOT NULL, status text NOT NULL CHECK(status='complete'), source_manifest jsonb NOT NULL, summary jsonb NOT NULL)");
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations(id, checksum) VALUES ($1, $2)', [migration.id, migration.checksum]);
    }
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    for (const spec of TABLES) {
      const columns = spec.columns.map(({ name }) => quoteIdentifier(name)).join(',');
      const names = spec.columns.map(({ name }) => name);
      for (let offset = 0; offset < plan.tables[spec.name].inserts.length; offset += 250) {
        const batch = plan.tables[spec.name].inserts.slice(offset, offset + 250);
        const parameters = batch.flatMap((row) => names.map((name) => row[name]));
        const placeholders = batch.map((_, rowIndex) => '(' + names.map((_, columnIndex) => '$' + (rowIndex * names.length + columnIndex + 1)).join(',') + ')').join(',');
        // Conflicts are inspected before writes; DO NOTHING only protects exact replay.
        await client.query('INSERT INTO ' + quoteIdentifier(spec.name) + '(' + columns + ') VALUES ' + placeholders + ' ON CONFLICT DO NOTHING', parameters);
      }
      for (const row of plan.tables[spec.name].updates) {
        if (spec.name !== 'rate_limits') throw new MigrationError('Atualizacao de dados da aplicacao nao permitida.');
        await client.query('UPDATE rate_limits SET count=$1, reset_at=$2 WHERE key=$3', [row.count, row.reset_at, row.key]);
      }
    }
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
    manifest.verification = await verifyImported(schema, plan);
    present = await targetTables(schema);
    manifest.targetAfter = datasetManifest(await readTarget(schema, present));
    manifest.status = 'complete';
    manifest.completedAt = new Date().toISOString();
    await client.query('INSERT INTO migration_runs(id, started_at, completed_at, status, source_manifest, summary) VALUES ($1,$2,$3,$4,$5,$6)', [runId, manifest.startedAt, manifest.completedAt, 'complete', JSON.stringify(manifest.sources), JSON.stringify({ plan: manifest.plan, verification: manifest.verification, sourceMerge: manifest.sourceMerge })]);
    await client.query('COMMIT');
  } else {
    await client.query('ROLLBACK');
    manifest.status = 'dry-run-complete';
    manifest.completedAt = new Date().toISOString();
  }
  inTransaction = false;
  await saveManifest();
  console.log(apply ? 'Migracao PostgreSQL concluida e verificada coluna por coluna.' : 'Simulacao concluida: nenhuma escrita no PostgreSQL.');
  console.table(Object.entries(manifest.plan).map(([table, counts]) => ({ table, ...counts })));
  console.log('Manifesto e backups: ' + path.relative(root, runDirectory));
}
try { await main(); }
catch (error) {
  if (inTransaction && client) { try { await client.query('ROLLBACK'); } catch {} }
  const detail = error instanceof MigrationError ? error.message : 'Falha na migracao (' + (/^[A-Z0-9_]+$/.test(String(error?.code || '')) ? error.code : 'ERRO') + '); detalhes de conexao e valores pessoais omitidos.';
  if (manifest) { manifest.status = 'failed'; manifest.error = detail; try { await saveManifest(); } catch {} }
  console.error(detail);
  process.exitCode = 1;
} finally { if (client) await client.end().catch(() => {}); }
