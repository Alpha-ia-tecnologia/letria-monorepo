import { AsyncLocalStorage } from 'node:async_hooks';
import { env } from 'cloudflare:workers';
import { Pool } from 'pg';
import { createPostgresDatabase, databaseError, databaseTypes, type Database } from './postgres-database';
import { errorResponse } from './security';

export type { Database, Statement } from './postgres-database';
interface DatabaseEnvironment { DATABASE_URL?: string; DATABASE_SCHEMA?: string; DATABASE_DRIVER?: string; DB?: Database }
interface RequestDatabase { database?: Database; pool?: Pool; failed?: boolean }
const requests = new AsyncLocalStorage<RequestDatabase>();

/** No sockets are shared between Workers requests. Connections open lazily. */
export function database(): Database {
  const context = requests.getStore();
  if (!context || context.failed) throw databaseError();
  if (context.database) return context.database;
  const settings = env as unknown as DatabaseEnvironment;
  const driver = settings.DATABASE_DRIVER?.trim().toLowerCase() || 'postgres';
  // Only an explicit legacy/test configuration can select SQLite. PostgreSQL
  // failures never silently create sessions or write data to a different DB.
  if (driver === 'sqlite') {
    if (!settings.DB) throw databaseError();
    return context.database = settings.DB;
  }
  if (driver !== 'postgres' || !settings.DATABASE_URL?.trim()) throw databaseError();
  const schema = settings.DATABASE_SCHEMA?.trim() || 'letria';
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) throw databaseError();
  try {
    const url = new URL(settings.DATABASE_URL.trim());
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw databaseError();
    url.searchParams.delete('options');
    const pool = new Pool({
      connectionString: url.href,
      max: 4,
      connectionTimeoutMillis: 8000,
      idleTimeoutMillis: 10000,
      query_timeout: 15000,
      statement_timeout: 15000,
      idle_in_transaction_session_timeout: 15000,
      application_name: 'letria-platform',
      options: '-c search_path=' + schema + ',pg_catalog -c timezone=UTC',
      types: databaseTypes,
    });
    pool.on('error', () => { context.failed = true; });
    context.pool = pool;
    return context.database = createPostgresDatabase(pool);
  } catch (error) { throw databaseError(error); }
}

/** Wrap a route, preserving its error handling and closing every request pool. */
export function withDatabase<Args extends unknown[]>(handler: (request: Request, ...args: Args) => Promise<Response>) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const context: RequestDatabase = {};
    return requests.run(context, async () => {
      try { return await handler(request, ...args); }
      catch (error) { return errorResponse(error); }
      finally {
        if (context.pool) {
          try { await context.pool.end(); }
          catch { /* Cleanup must not replace a completed response or expose driver details. */ }
        }
      }
    });
  };
}
