import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  const url = getServerEnv().DATABASE_URL;
  if (!url) throw new AppError(503, "DATABASE_UNAVAILABLE", "The database is not configured.");
  return drizzle({ client: neon(url), schema });
}

/**
 * Returns the trusted server-side Drizzle connection.
 *
 * Service functions keep accepting a user context because they perform the
 * application RBAC checks. JWT-authorized database calls use data-api.ts;
 * passing a Neon Auth JWT to this SQL client would select Neon's separate,
 * incompatible direct-SQL RLS transport.
 */
export function getDb(): ReturnType<typeof createDatabase>;
export function getDb(context: { accessToken: string | null }): ReturnType<typeof createDatabase>;
export function getDb() {
  database ??= createDatabase();
  return database;
}
