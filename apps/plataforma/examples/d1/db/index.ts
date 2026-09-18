import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/** Standalone legacy example; the platform uses lib/server/database instead. */
export function getDb() {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error('This archived D1 example requires a separate DB binding.');
  return drizzle(binding, { schema });
}
