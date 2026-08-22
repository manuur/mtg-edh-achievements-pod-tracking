import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  NEON_AUTH_BASE_URL: z.string().url().optional(),
  NEON_AUTH_COOKIE_SECRET: z.string().min(32).optional(),
  NEON_DATA_API_URL: z.string().url().optional(),
  DEV_AUTH_BYPASS: z.enum(["true", "false"]).default("false"),
  DEV_USER_ID: z.string().uuid().default("00000000-0000-4000-8000-000000000001"),
  DEV_USER_EMAIL: z.string().email().default("owner@example.com"),
  DEV_USER_NAME: z.string().min(1).default("Local Owner"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) cached = serverSchema.parse(process.env);
  return cached;
}

export function isAuthConfigured() {
  const env = getServerEnv();
  return Boolean(env.NEON_AUTH_BASE_URL && env.NEON_AUTH_COOKIE_SECRET);
}

export function isDataApiConfigured() {
  return Boolean(getServerEnv().NEON_DATA_API_URL);
}

export function isDevAuthEnabled() {
  const env = getServerEnv();
  return env.NODE_ENV !== "production" && env.DEV_AUTH_BYPASS === "true";
}
