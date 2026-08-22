import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

let database: ReturnType<typeof createDatabase> | undefined;
const authenticatedDatabases = new WeakMap<object, ReturnType<typeof createDatabase>>();

function createDatabase(authToken?: string) {
  const url = getServerEnv().DATABASE_URL;
  if (!url) throw new AppError(503, "DATABASE_UNAVAILABLE", "The database is not configured.");
  return drizzle({ client: neon(url, authToken ? { authToken } : undefined), schema });
}

export function getDb(context?: { accessToken: string | null }) {
  if (!context) {
    database ??= createDatabase();
    return database;
  }
  if (!context.accessToken) {
    if (getServerEnv().NODE_ENV === "production") {
      throw new AppError(503, "DATABASE_UNAVAILABLE", "The authenticated database token is unavailable.");
    }
    database ??= createDatabase();
    return database;
  }
  const existing = authenticatedDatabases.get(context);
  if (existing) return existing;
  const authenticated = createDatabase(context.accessToken);
  authenticatedDatabases.set(context, authenticated);
  return authenticated;
}
