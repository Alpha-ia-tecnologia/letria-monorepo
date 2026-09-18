import test from 'node:test';
import assert from 'node:assert/strict';
import { types } from 'pg';
import { ApiError } from '../lib/server/security';
import { createPostgresDatabase, databaseError, databaseTypes, postgresSql, type DatabaseClient, type DatabasePool, type DatabaseRow } from '../lib/server/postgres-database';

test('SQL placeholders skip literals, identifiers, nested comments and dollar quotes', () => {
  const source = 'SELECT ?, ' + "'What? it''s fine'" + ', "why?", $$literal?$$, $text$?$text$ /* ? /* ? */ */ -- ?\n WHERE id=?';
  const output = postgresSql(source);
  assert.equal(output.parameters, 2);
  assert.equal(output.text, source.replace('SELECT ?', 'SELECT $1').replace('id=?', 'id=$2'));
  assert.equal(postgresSql('SELECT ' + String.fromCharCode(96) + 'why?' + String.fromCharCode(96) + ', ?').text, 'SELECT "why?", $1');
});

test('SQLite conflict inserts become PostgreSQL inserts before RETURNING and trailing comments', () => {
  const sql = postgresSql('INSERT OR IGNORE INTO events (id,body) VALUES (?,?) RETURNING id; -- ?');
  assert.equal(sql.parameters, 2);
  assert.match(sql.text, /^INSERT\s+INTO events/);
  assert.match(sql.text, /VALUES \(\$1,\$2\)\s+ON CONFLICT DO NOTHING RETURNING id; -- \?$/);
  const select = postgresSql('INSERT OR IGNORE INTO events (id) SELECT ? WHERE ?=1 -- keep');
  assert.match(select.text, /WHERE \$2=1 ON CONFLICT DO NOTHING\s+-- keep$/);
  assert.equal(postgresSql("SELECT 'INSERT OR IGNORE ?' WHERE id=?").text, "SELECT 'INSERT OR IGNORE ?' WHERE id=$1");
});

test('malformed quoted SQL fails before execution', () => {
  for (const sql of ["SELECT 'open ?", 'SELECT /* open ?', 'SELECT $$open ?']) assert.throws(() => postgresSql(sql), ApiError);
});

test('row parsers preserve JSON, dates, UTC timestamps and exact large integers', () => {
  const json = '{"read":false,"choices":["á","b"]}';
  assert.equal(databaseTypes.getTypeParser(3802)(json), json);
  assert.equal(databaseTypes.getTypeParser(114)(json), json);
  assert.equal(databaseTypes.getTypeParser(1082)('2026-09-16'), '2026-09-16');
  assert.equal(databaseTypes.getTypeParser(1184)('2026-09-16 07:15:30-03'), '2026-09-16T10:15:30.000Z');
  assert.equal(databaseTypes.getTypeParser(1114)('2026-09-16 10:15:30'), '2026-09-16T10:15:30.000Z');
  assert.equal(databaseTypes.getTypeParser(20)('1726512000000'), 1726512000000);
  assert.equal(databaseTypes.getTypeParser(20)('9007199254740993'), '9007199254740993');
  assert.deepEqual(types.getTypeParser(3802)(json), JSON.parse(json));
});

function fakePool(options: { failSql?: string; rollbackFailure?: boolean; rows?: DatabaseRow[] } = {}) {
  const calls: { sql: string; values: unknown[]; connection: 'pool' | 'client' }[] = [];
  const releases: boolean[] = [];
  const query = async (sql: string, values: unknown[] = [], connection: 'pool' | 'client' = 'pool') => {
    calls.push({ sql, values, connection });
    if (sql === options.failSql || (options.rollbackFailure && sql === 'ROLLBACK')) throw Object.assign(new Error('private connection and SQL values'), { code: 'XX000' });
    return { rows: options.rows || [], rowCount: 1 };
  };
  const client: DatabaseClient = { query: (sql, values) => query(sql, values, 'client'), release: (destroy = false) => { releases.push(destroy); } };
  const pool: DatabasePool = { query, connect: async () => client };
  return { pool, calls, releases };
}

test('statement bindings are isolated and parameters are never interpolated into SQL', async () => {
  const fake = fakePool({ rows: [{ id: 'result' }] }), database = createPostgresDatabase(fake.pool);
  const statement = database.prepare('SELECT * FROM users WHERE name=?');
  const unsafe = "Robert'); DELETE FROM users; --";
  const [first, all] = await Promise.all([statement.bind(unsafe).first(), statement.bind('safe').all()]);
  assert.deepEqual(first, { id: 'result' });
  assert.deepEqual(all, { results: [{ id: 'result' }] });
  assert.equal(fake.calls[0].sql, 'SELECT * FROM users WHERE name=$1');
  assert.deepEqual(fake.calls[0].values, [unsafe]);
  assert.deepEqual(fake.calls[1].values, ['safe']);
  await assert.rejects(statement.run(), ApiError);
  assert.equal(fake.calls.length, 2);
});

test('batch commits every statement on a single checked out connection', async () => {
  const fake = fakePool(), database = createPostgresDatabase(fake.pool);
  const results = await database.batch([database.prepare('INSERT INTO events (id) VALUES (?)').bind('first'), database.prepare('UPDATE events SET id=? WHERE id=?').bind('second', 'first')]);
  assert.equal(results.length, 2);
  assert.deepEqual(fake.calls.map(call => call.sql), ['BEGIN', 'INSERT INTO events (id) VALUES ($1)', 'UPDATE events SET id=$1 WHERE id=$2', 'COMMIT']);
  assert.ok(fake.calls.every(call => call.connection === 'client'));
  assert.deepEqual(fake.releases, [false]);
});

test('batch rolls back on failure, stops following statements and releases its connection', async () => {
  const fake = fakePool({ failSql: 'FAIL' }), database = createPostgresDatabase(fake.pool);
  await assert.rejects(database.batch([database.prepare('SELECT 1'), database.prepare('FAIL'), database.prepare('SELECT 2')]), { code: 'DATABASE_UNAVAILABLE' });
  assert.deepEqual(fake.calls.map(call => call.sql), ['BEGIN', 'SELECT 1', 'FAIL', 'ROLLBACK']);
  assert.deepEqual(fake.releases, [false]);
});

test('rollback failures destroy the connection and foreign batches are rejected before querying', async () => {
  const fake = fakePool({ failSql: 'FAIL', rollbackFailure: true }), database = createPostgresDatabase(fake.pool);
  await assert.rejects(database.batch([database.prepare('FAIL')]), ApiError);
  assert.deepEqual(fake.releases, [true]);
  const other = createPostgresDatabase(fakePool().pool);
  const count = fake.calls.length;
  await assert.rejects(database.batch([other.prepare('SELECT 1')]), ApiError);
  assert.equal(fake.calls.length, count);
  assert.deepEqual(await database.batch([]), []);
});

test('database errors preserve safe app errors and hide PostgreSQL credentials and record details', async () => {
  const privateError = Object.assign(new Error('password=private value=student SQL'), { code: '23505', detail: 'private' });
  const error = databaseError(privateError);
  assert.equal(error.status, 409);
  assert.equal(error.code, 'DATABASE_CONFLICT');
  assert.doesNotMatch(error.message + JSON.stringify(error), /private|student|password|SQL/);
  const original = new ApiError(403, 'Forbidden', 'FORBIDDEN');
  assert.equal(databaseError(original), original);
  const fake = fakePool({ failSql: 'FAIL' });
  await assert.rejects(createPostgresDatabase(fake.pool).prepare('FAIL').run(), { code: 'DATABASE_UNAVAILABLE', status: 503 });
});
