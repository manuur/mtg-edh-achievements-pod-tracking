import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL, DATABASE_URL_UNPOOLED, or DATABASE_URL is required.");

const db = drizzle(neon(connectionString));
await migrate(db, { migrationsFolder: "drizzle" });
console.log("Database migrations applied successfully.");
