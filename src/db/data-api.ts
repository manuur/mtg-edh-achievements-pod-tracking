import { fetchWithToken, NeonPostgrestClient } from "@neondatabase/postgrest-js";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";

export function getAuthenticatedDataApi(context: UserContext) {
  const url = getServerEnv().NEON_DATA_API_URL;
  if (!url || !context.accessToken) return null;
  return new NeonPostgrestClient({
    dataApiUrl: url,
    options: {
      db: { schema: "api" },
      global: { fetch: fetchWithToken(async () => context.accessToken) },
    },
  });
}

export function assertDataApiResult<T>(result: { data: T | null; error: { message: string; code?: string } | null }) {
  if (result.error) {
    const code = result.error.code;
    if (code === "42501") throw new AppError(403, "FORBIDDEN", result.error.message);
    if (code === "23514" || code === "22P02") throw new AppError(422, "VALIDATION_ERROR", result.error.message);
    if (code === "40001" || code === "23505") throw new AppError(409, "CONFLICT", result.error.message);
    throw new AppError(500, "INTERNAL_ERROR", "The authenticated database request failed.");
  }
  return result.data;
}
