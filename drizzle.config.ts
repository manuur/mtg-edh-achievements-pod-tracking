import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // Schema generation is intentionally offline. Commands that connect to a
  // database should prefer the direct migration URL when one is configured.
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? "postgresql://schema-only:unused@localhost:5432/edh_tracker",
  },
  strict: true,
  verbose: true,
});
