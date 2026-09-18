import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

const testSchemaPattern = /^letria_test_[a-f0-9]{32}$/;
function quotedTestSchema(schema) {
  if (!testSchemaPattern.test(schema)) throw new Error("Refusing to operate outside an isolated PostgreSQL test schema.");
  return `"${schema}"`;
}
function quotedTable(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error("Unexpected table identifier in PostgreSQL test schema.");
  return `"${name}"`;
}
function postgresUrl(root) {
  const envPath = path.join(root, ".env.postgres.local");
  const local = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  const value = process.env.DATABASE_URL || local.DATABASE_URL;
  if (!value) throw new Error("PostgreSQL tests require DATABASE_URL in the environment or .env.postgres.local.");
  let url;
  try { url = new URL(value); } catch { throw new Error("PostgreSQL test DATABASE_URL is invalid."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("PostgreSQL tests require a postgres or postgresql URL.");
  return value;
}

/** Construction reads configuration only. The test runner explicitly calls setup() to connect. */
export function createPostgresTestDatabase(root) {
  const schema = `letria_test_${randomUUID().replaceAll("-", "")}`;
  const namespace = quotedTestSchema(schema);
  const connectionString = postgresUrl(root);
  let client;
  let created = false;
  const env = { DATABASE_DRIVER: "postgres", DATABASE_URL: connectionString, DATABASE_SCHEMA: schema };
  return {
    env,
    get schema() { return schema; },
    async setup() {
      // No target supplied by a caller or configuration can replace the generated schema.
      quotedTestSchema(schema);
      const { Client } = await import("pg");
      client = new Client({ connectionString, application_name: "letria-api-isolated-tests", connectionTimeoutMillis: 10000 });
      try {
        await client.connect();
        await client.query(`CREATE SCHEMA ${namespace}`);
        created = true;
        await client.query(`SET search_path TO ${namespace}`);
        const migration = readFileSync(path.join(root, "postgres", "migrations", "0001_initial.sql"), "utf8");
        await client.query("BEGIN");
        try { await client.query(migration); await client.query("COMMIT"); }
        catch (error) { await client.query("ROLLBACK"); throw error; }
      } catch (error) {
        // Connection errors may contain credential-bearing URLs. Surface only a code.
        throw new Error(`Isolated PostgreSQL test setup failed (${error?.code || "SETUP_ERROR"}). Verify the private connection settings and schema permissions.`);
      }
    },
    async reset() {
      if (!created || !client) throw new Error("PostgreSQL test schema has not been created.");
      quotedTestSchema(schema);
      const { rows } = await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1 ORDER BY tablename", [schema]);
      if (!rows.length) throw new Error("No tables found in the isolated PostgreSQL test schema.");
      const tables = rows.map(row => `${namespace}.${quotedTable(row.tablename)}`).join(", ");
      // Explicitly qualified tables and no CASCADE prevent truncating unrelated schemas.
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY`);
    },
    async first(query, ...values) {
      if (!created || !client) throw new Error("PostgreSQL test schema has not been created.");
      let parameter = 0;
      const statement = query.replace(/\?/g, () => `$${++parameter}`);
      if (parameter !== values.length) throw new Error("Test SQL parameter count does not match.");
      return (await client.query(statement, values)).rows[0] || null;
    },
    async close() {
      if (!client) return;
      try {
        if (created) {
          quotedTestSchema(schema);
          await client.query(`DROP SCHEMA ${namespace} CASCADE`);
          created = false;
        }
      } finally { await client.end(); client = undefined; }
    },
  };
}