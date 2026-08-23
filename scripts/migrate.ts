import { loadEnvConfig } from "./load-environment";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

loadEnvConfig(process.cwd());

const configuredMigrationUrl = process.env.DATABASE_MIGRATION_URL;
const migrationUrlIsExample = configuredMigrationUrl
  ? new URL(configuredMigrationUrl).hostname === "host"
  : false;
const connectionString = migrationUrlIsExample
  ? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  : configuredMigrationUrl ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL, DATABASE_URL_UNPOOLED, or DATABASE_URL is required.");

const db = drizzle(neon(connectionString));
await migrate(db, { migrationsFolder: "drizzle" });
console.log("Database migrations applied successfully.");
