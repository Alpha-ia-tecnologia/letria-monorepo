import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
if (existsSync(".env.postgres.local")) process.loadEnvFile(".env.postgres.local");
export default defineConfig({
  out: "./postgres/generated",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  schemaFilter: [process.env.DATABASE_SCHEMA || "letria"],
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
});
