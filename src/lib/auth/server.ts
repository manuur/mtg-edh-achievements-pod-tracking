import { createNeonAuth } from "@neondatabase/auth/next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appSuperuser, auditEvents, playerClaimEmails, players } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getServerEnv, isAuthConfigured, isDevAuthEnabled } from "@/lib/env";

let neonAuth: ReturnType<typeof createNeonAuth> | null | undefined;

export function getNeonAuth() {
  if (neonAuth !== undefined) return neonAuth;
  if (!isAuthConfigured()) return (neonAuth = null);
  const env = getServerEnv();
  return (neonAuth = createNeonAuth({
    baseUrl: env.DATABASE_NEON_AUTH_BASE_URL!,
    cookies: { secret: env.NEON_AUTH_COOKIE_SECRET!, sessionDataTtl: 300 },
  }));
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface UserContext {
  user: AuthUser;
  player: { id: string; displayName: string };
  isSuperuser: boolean;
  accessToken: string | null;
}

function readAccessToken(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const token = data.accessToken ?? data.token;
  return typeof token === "string" ? token : null;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const env = getServerEnv();
  if (isDevAuthEnabled()) {
    return { id: env.DEV_USER_ID, email: env.DEV_USER_EMAIL, name: env.DEV_USER_NAME };
  }
  const auth = getNeonAuth();
  if (!auth) return null;
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user?.id || !user.email || user.emailVerified !== true) return null;
  return { id: String(user.id), email: String(user.email).toLowerCase(), name: user.name || user.email.split("@")[0] };
}

async function resolvePlayer(user: AuthUser) {
  const db = getDb();
  const existing = await db.query.players.findFirst({ where: eq(players.authUserId, user.id) });
  if (existing) return existing;

  const claim = await db.query.playerClaimEmails.findFirst({
    where: eq(playerClaimEmails.emailNormalized, user.email.toLowerCase()),
  });

  if (claim) {
    const [claimed] = await db
      .update(players)
      .set({ authUserId: user.id, displayName: user.name, updatedAt: new Date(), version: sql`${players.version} + 1` })
      .where(and(eq(players.id, claim.playerId), isNull(players.authUserId)))
      .returning();
    if (claimed) {
      await db.update(playerClaimEmails).set({ claimedAt: new Date() }).where(eq(playerClaimEmails.playerId, claimed.id));
      await db.insert(auditEvents).values({ actorPlayerId: claimed.id, action: "PROFILE_CLAIMED", entityType: "player", entityId: claimed.id });
      return claimed;
    }
    const alreadyClaimed = await db.query.players.findFirst({ where: eq(players.id, claim.playerId) });
    if (alreadyClaimed?.authUserId && alreadyClaimed.authUserId !== user.id) {
      throw new AppError(409, "CONFLICT", "This Google email is already linked to another account identity.");
    }
    const raced = await db.query.players.findFirst({ where: eq(players.authUserId, user.id) });
    if (raced) return raced;
  }

  const [created] = await db.insert(players).values({ authUserId: user.id, displayName: user.name }).onConflictDoNothing({ target: players.authUserId }).returning();
  const resolved = created ?? await db.query.players.findFirst({ where: eq(players.authUserId, user.id) });
  if (!resolved) throw new AppError(409, "CONFLICT", "The player profile could not be claimed.");
  await db.insert(playerClaimEmails).values({
    playerId: resolved.id,
    emailNormalized: user.email.toLowerCase(),
    claimedAt: new Date(),
  }).onConflictDoNothing();
  if (created) await db.insert(auditEvents).values({ actorPlayerId: resolved.id, action: "PROFILE_CREATED", entityType: "player", entityId: resolved.id });
  return resolved;
}

export async function getUserContext(): Promise<UserContext | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const player = await resolvePlayer(user);
  const auth = getNeonAuth();
  const accessToken = auth && !isDevAuthEnabled()
    ? readAccessToken(await auth.token({}))
    : null;
  let isSuperuser: boolean;
  if (accessToken) {
    const result = await getDb({ accessToken }).execute<{ is_superuser: boolean }>(sql`select private.is_superuser() as is_superuser`);
    isSuperuser = Boolean(result.rows[0]?.is_superuser);
  } else {
    const superuser = await getDb().query.appSuperuser.findFirst({ where: eq(appSuperuser.authUserId, user.id) });
    isSuperuser = Boolean(superuser);
  }
  return {
    user,
    player: { id: player.id, displayName: player.displayName },
    isSuperuser,
    accessToken,
  };
}

export async function requireUserContext() {
  const context = await getUserContext();
  if (!context) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return context;
}
