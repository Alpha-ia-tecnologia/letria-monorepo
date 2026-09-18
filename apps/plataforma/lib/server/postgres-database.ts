import { types } from 'pg';
import { ApiError } from './security';

export type DatabaseRow = Record<string, unknown>;
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = DatabaseRow>(): Promise<T | null>;
  all<T = DatabaseRow>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
interface QueryResult { rows: DatabaseRow[]; rowCount: number | null }
interface Queryable { query(text: string, values?: unknown[]): Promise<QueryResult> }
export interface DatabaseClient extends Queryable { release(destroy?: boolean): void }
export interface DatabasePool extends Queryable { connect(): Promise<DatabaseClient> }

export function databaseError(error?: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code === '23505') return new ApiError(409, 'Este registro já existe. Atualize a página e tente novamente.', 'DATABASE_CONFLICT');
  if (code === '23503') return new ApiError(409, 'Este registro está vinculado a outros dados. Atualize a página e tente novamente.', 'DATABASE_CONSTRAINT');
  if (code === '23514' || code === '23502' || code.startsWith('22')) return new ApiError(400, 'Os dados informados não são válidos para este registro.', 'DATABASE_INVALID_DATA');
  // Driver errors can contain credentials, SQL, student data or parameters.
  // Only this generic error is allowed to reach route logging/responses.
  return new ApiError(503, 'O banco de dados está indisponível. Tente novamente em instantes.', 'DATABASE_UNAVAILABLE');
}

type Token = { text: string; kind: 'word' | 'trivia' | 'other' };
/** Translate only SQL syntax outside quoted literals/identifiers and comments. */
export function postgresSql(sql: string): { text: string; parameters: number } {
  const tokens: Token[] = [];
  let i = 0, parameters = 0;
  while (i < sql.length) {
    const start = i, char = sql[i];
    if (/\s/.test(char)) { while (i < sql.length && /\s/.test(sql[i])) i++; tokens.push({ text: sql.slice(start, i), kind: 'trivia' }); continue; }
    if (sql.startsWith('--', i)) { while (i < sql.length && sql[i] !== '\n') i++; tokens.push({ text: sql.slice(start, i), kind: 'trivia' }); continue; }
    if (sql.startsWith('/*', i)) {
      i += 2; let depth = 1;
      while (i < sql.length && depth) { if (sql.startsWith('/*', i)) { depth++; i += 2; } else if (sql.startsWith('*/', i)) { depth--; i += 2; } else i++; }
      if (depth) throw databaseError();
      tokens.push({ text: sql.slice(start, i), kind: 'trivia' }); continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const escaped = char === "'" && /(?:^|[^a-zA-Z0-9_])[eE]$/.test(sql.slice(0, i));
      i++; let closed = false;
      while (i < sql.length) {
        if (escaped && sql[i] === '\\') { i += 2; continue; }
        if (sql[i] === char) { if (sql[i + 1] === char) { i += 2; continue; } i++; closed = true; break; }
        i++;
      }
      if (!closed) throw databaseError();
      const literal = sql.slice(start, i);
      tokens.push({ text: char === '`' ? '"' + literal.slice(1, -1).replace(/``/g, '`').replace(/"/g, '""') + '"' : literal, kind: 'other' }); continue;
    }
    if (char === '$') {
      const delimiter = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0];
      if (delimiter) {
        const end = sql.indexOf(delimiter, i + delimiter.length);
        if (end < 0) throw databaseError();
        i = end + delimiter.length; tokens.push({ text: sql.slice(start, i), kind: 'other' }); continue;
      }
    }
    if (char === '?') { tokens.push({ text: '$' + ++parameters, kind: 'other' }); i++; continue; }
    if (/[a-zA-Z_]/.test(char)) { while (i < sql.length && /[a-zA-Z0-9_$]/.test(sql[i])) i++; tokens.push({ text: sql.slice(start, i), kind: 'word' }); continue; }
    tokens.push({ text: char, kind: 'other' }); i++;
  }
  const syntax = tokens.map((token, index) => ({ ...token, index })).filter(token => token.kind !== 'trivia');
  if (syntax[0]?.text.toUpperCase() === 'INSERT' && syntax[1]?.text.toUpperCase() === 'OR' && syntax[2]?.text.toUpperCase() === 'IGNORE') {
    tokens[syntax[1].index].text = ''; tokens[syntax[2].index].text = '';
    let depth = 0, insertion = tokens.length;
    for (let index = 3; index < syntax.length; index++) {
      const token = syntax[index];
      if (token.text === '(') depth++;
      else if (token.text === ')') depth--;
      else if (depth === 0 && ((token.kind === 'word' && token.text.toUpperCase() === 'RETURNING') || token.text === ';')) { insertion = token.index; break; }
    }
    // Add before trailing comments, ensuring -- comments cannot swallow it.
    if (insertion === tokens.length) while (insertion > 0 && tokens[insertion - 1].kind === 'trivia') insertion--;
    tokens.splice(insertion, 0, { text: ' ON CONFLICT DO NOTHING ', kind: 'other' });
  }
  return { text: tokens.map(token => token.text).join(''), parameters };
}

/** Match the previous D1 row contract without globally changing pg parsers. */
export const databaseTypes = {
  getTypeParser(oid: number, format: 'text' | 'binary' = 'text') {
    if (format === 'text') {
      if (oid === 114 || oid === 3802 || oid === 1082) return (value: string) => value;
      if (oid === 1184) return (value: string) => new Date(value).toISOString();
      if (oid === 1114) return (value: string) => new Date(value + 'Z').toISOString();
      if (oid === 20) return (value: string) => { const number = Number(value); return Number.isSafeInteger(number) ? number : value; };
    }
    return types.getTypeParser(oid, format);
  },
};

class PostgresStatement implements Statement {
  constructor(readonly owner: DatabasePool, readonly text: string, readonly parameterCount: number, readonly values: unknown[] = []) {}
  bind(...values: unknown[]): Statement { return new PostgresStatement(this.owner, this.text, this.parameterCount, [...values]); }
  async execute(target: Queryable = this.owner): Promise<QueryResult> {
    if (this.values.length !== this.parameterCount) throw databaseError();
    try { return await target.query(this.text, this.values); } catch (error) { throw databaseError(error); }
  }
  async first<T = DatabaseRow>(): Promise<T | null> { return (await this.execute()).rows[0] as T ?? null; }
  async all<T = DatabaseRow>(): Promise<{ results: T[] }> { return { results: (await this.execute()).rows as T[] }; }
  async run() { const result = await this.execute(); return { success: true, meta: { changes: result.rowCount ?? 0 } }; }
}

export function createPostgresDatabase(pool: DatabasePool): Database {
  return {
    prepare(sql) { const translated = postgresSql(sql); return new PostgresStatement(pool, translated.text, translated.parameters); },
    async batch(statements) {
      if (!statements.length) return [];
      if (statements.some(statement => !(statement instanceof PostgresStatement) || statement.owner !== pool)) throw databaseError();
      let client: DatabaseClient | undefined, destroy = false;
      try {
        client = await pool.connect();
        await client.query('BEGIN');
        const results: unknown[] = [];
        for (const statement of statements as PostgresStatement[]) {
          const result = await statement.execute(client);
          results.push({ success: true, meta: { changes: result.rowCount ?? 0 } });
        }
        await client.query('COMMIT');
        return results;
      } catch (error) {
        if (client) { try { await client.query('ROLLBACK'); } catch { destroy = true; } }
        throw databaseError(error);
      } finally { client?.release(destroy); }
    },
  };
}
