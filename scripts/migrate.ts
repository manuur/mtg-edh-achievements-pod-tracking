import { loadEnvConfig } from "./load-environment";
import { neon } from "@neondatabase/serverless";
import { readMigrationFiles } from "drizzle-orm/migrator";

loadEnvConfig(process.cwd());

const configuredMigrationUrl = process.env.DATABASE_MIGRATION_URL;
const migrationUrlIsExample = configuredMigrationUrl
  ? new URL(configuredMigrationUrl).hostname === "host"
  : false;
const connectionString = migrationUrlIsExample
  ? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  : configuredMigrationUrl ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL, DATABASE_URL_UNPOOLED, or DATABASE_URL is required.");

const sql = neon(connectionString);
await sql.query('CREATE SCHEMA IF NOT EXISTS "drizzle"');
await sql.query('CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
const [lastMigration] = await sql.query('SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1');
for (const migration of readMigrationFiles({ migrationsFolder: "drizzle" })) {
  if (lastMigration && Number(lastMigration.created_at) >= migration.folderMillis) continue;
  // Commit each version separately: PostgreSQL requires an enum addition to
  // commit before a later migration can use that value. A failed version rolls
  // back together with its history entry and can be retried safely.
  await sql.transaction([
    ...migration.sql.filter((statement) => statement.trim()).map((statement) => sql.query(statement)),
    sql.query('INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)', [migration.hash, migration.folderMillis]),
  ]);
}
console.log("Database migrations applied successfully.");
