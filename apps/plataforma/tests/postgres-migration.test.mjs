import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_BY_NAME, canonicalRow, emptyDataset, mergeDatasets, validateDataset, buildImportPlan, validateSchemaName } from '../scripts/postgres-migration-lib.mjs';
const institution = (name = 'Escola teste') => ({ id: 'school-1', name, is_demo: 0, created_at: '2026-09-16T12:00:00.000Z' });
const dataset = (row = institution()) => ({ ...emptyDataset(), institutions: [row] });
const user = (id, email = 'professor@example.test') => ({ id, institution_id: 'school-1', name: 'Professor', email, password_hash: null, role: 'teacher', student_id: null, created_at: '2026-09-16T12:00:00.000Z' });

test('normalizes JSON ordering and timestamp timezone without changing educational content', () => {
  const spec = TABLE_BY_NAME.get('sessions');
  const first = canonicalRow(spec, { token_hash: 'token', user_id: 'user', role: 'teacher', expires_at: '2026-09-16T09:00:00-03:00', settings: '{"voice":true,"preferences":{"b":2,"a":1}}' });
  const second = canonicalRow(spec, { token_hash: 'token', user_id: 'user', role: 'teacher', expires_at: new Date('2026-09-16T12:00:00Z'), settings: { preferences: { a: 1, b: 2 }, voice: true } });
  assert.deepEqual(first, second);
});
test('rejects invalid JSON, absent columns and impossible dates before database writes', () => {
  const session = { token_hash: 'token', user_id: 'user', role: 'teacher', expires_at: '2026-09-16T12:00:00Z', settings: '{invalid}' };
  assert.throws(() => canonicalRow(TABLE_BY_NAME.get('sessions'), session), /sessions.settings/);
  assert.throws(() => canonicalRow(TABLE_BY_NAME.get('institutions'), { id: 'missing' }), /Coluna obrigatoria/);
  const assignment = { id: 'a', institution_id: 'i', classroom_id: 'c', activity_id: 'a', title: 'A', due_date: '2026-02-30', created_at: '2026-09-16T12:00:00Z' };
  assert.throws(() => canonicalRow(TABLE_BY_NAME.get('assignments'), assignment), /assignments.due_date/);
});
test('merges exact source duplicates once, preserving independent tenants', () => {
  const another = dataset({ ...institution(), id: 'school-2' });
  const merged = mergeDatasets([dataset(), dataset(), another]);
  assert.equal(merged.data.institutions.length, 2);
  assert.equal(merged.summary.institutions.duplicates, 1);
  validateDataset(merged.data);
});
test('rejects conflicting primary-key rows without leaking row content', () => {
  assert.throws(() => mergeDatasets([dataset('ignored'), dataset()]), /Coluna obrigatoria/);
  const expected = (error) => /Conflito de dados/.test(error.message) && /name/.test(error.message) && !/Nome privado/.test(error.message);
  assert.throws(() => mergeDatasets([dataset(), dataset(institution('Nome privado'))]), expected);
});
test('rejects collisions on secondary uniqueness even with different IDs', () => {
  const first = dataset(), second = dataset();
  first.users.push(user('u1'));
  second.users.push(user('u2'));
  assert.throws(() => mergeDatasets([first, second]), /Conflito de unicidade: users/);
});
test('operational throttles merge conservatively by maximum count and reset', () => {
  const first = emptyDataset(), second = emptyDataset();
  first.rate_limits.push({ key: 'login', count: 4, reset_at: 1700000000000 });
  second.rate_limits.push({ key: 'login', count: 2, reset_at: 1800000000000 });
  const merged = mergeDatasets([first, second]);
  assert.deepEqual(merged.data.rate_limits[0], { key: 'login', count: 4, reset_at: 1800000000000 });
  assert.equal(merged.summary.rate_limits.operationalMerges, 1);
});
test('finds broken references and unsupported flags before import', () => {
  const orphan = dataset();
  orphan.users.push({ ...user('u1'), student_id: 'missing-student' });
  assert.throws(() => validateDataset(orphan), /users.student_id/);
  assert.throws(() => validateDataset(dataset({ ...institution(), is_demo: 2 })), /restricoes PostgreSQL/);
});
test('replay is idempotent and verifies every imported row while retaining target-only data', () => {
  const target = dataset();
  target.institutions.push({ ...institution(), id: 'target-only' });
  const source = dataset();
  const initial = buildImportPlan(emptyDataset(), source);
  assert.equal(initial.tables.institutions.inserts.length, 1);
  const replay = buildImportPlan(target, source);
  assert.equal(replay.tables.institutions.inserts.length, 0);
  assert.equal(replay.tables.institutions.updates.length, 0);
  assert.equal(replay.tables.institutions.verify.length, 1);
  assert.equal(replay.merged.institutions.length, 2);
});
test('target conflict aborts and only operational data may be updated', () => {
  assert.throws(() => buildImportPlan(dataset(), dataset(institution('Outro nome'))), /Conflito de dados/);
  const target = emptyDataset(), source = emptyDataset();
  target.rate_limits.push({ key: 'login', count: 1, reset_at: 1700000000000 });
  source.rate_limits.push({ key: 'login', count: 3, reset_at: 1700000000000 });
  const plan = buildImportPlan(target, source);
  assert.equal(plan.tables.rate_limits.inserts.length, 0);
  assert.deepEqual(plan.tables.rate_limits.updates, [{ key: 'login', count: 3, reset_at: 1700000000000 }]);
});
test('isolates app schemas and rejects shared schemas and identifier injection', () => {
  assert.equal(validateSchemaName('letria'), 'letria');
  for (const unsafe of ['public', 'pg_catalog', 'pg_temp', 'information_schema', 'letria;DROP TABLE users', 'UpperCase']) assert.throws(() => validateSchemaName(unsafe));
});
