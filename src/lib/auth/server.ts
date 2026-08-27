import { createNeonAuth } from "@neondatabase/auth/next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { appSuperuser, auditEvents, playerClaimEmails, players } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getServerEnv, isAuthConfigured, isDevAuthEnabled } from "@/lib/env";
import type { ThemePreference } from "@/lib/theme-types";

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
  player: { id: string; displayName: string; themePreference: ThemePreference; version: number };
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
  return { id: String(user.id), email: String(user.email).trim().toLowerCase(), name: user.name || user.email.split("@")[0] };
}

async function repairMissingClaimEmail(playerId: string, emailNormalized: string) {
  const db = getDb();
  const existingClaim = await db.query.playerClaimEmails.findFirst({
    where: eq(playerClaimEmails.playerId, playerId),
  });
  if (existingClaim) {
    if (!existingClaim.claimedAt) {
      await db.update(playerClaimEmails).set({ claimedAt: new Date() }).where(eq(playerClaimEmails.playerId, playerId));
    }
    return;
  }

  const emailClaim = await db.query.playerClaimEmails.findFirst({
    where: eq(playerClaimEmails.emailNormalized, emailNormalized),
  });
  if (emailClaim && emailClaim.playerId !== playerId) {
    throw new AppError(409, "CONFLICT", "This Google email is already linked to another player profile.");
  }

  const [inserted] = await db.insert(playerClaimEmails).values({
    playerId,
    emailNormalized,
    claimedAt: new Date(),
  }).onConflictDoNothing().returning({ playerId: playerClaimEmails.playerId });

  if (!inserted) {
    const recovered = await db.query.playerClaimEmails.findFirst({
      where: eq(playerClaimEmails.playerId, playerId),
    });
    if (!recovered) throw new AppError(409, "CONFLICT", "The player claim email could not be recovered.");
    return;
  }

  await db.insert(auditEvents).values({
    actorPlayerId: playerId,
    action: "PROFILE_IDENTITY_REPAIRED",
    entityType: "player",
    entityId: playerId,
  });
}

async function resolvePlayer(user: AuthUser) {
  const db = getDb();
  const existing = await db.query.players.findFirst({ where: eq(players.authUserId, user.id) });
  if (existing) {
    await repairMissingClaimEmail(existing.id, user.email);
    return existing;
  }

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
  // Runtime user-authorized operations go through the Data API. Sending this
  // JWT through the direct SQL driver would use Neon's separate RLS/JWKS mode,
  // which cannot be enabled on a branch that uses the Data API.
  const superuser = await getDb().query.appSuperuser.findFirst({ where: eq(appSuperuser.authUserId, user.id) });
  const isSuperuser = Boolean(superuser);
  return {
    user,
    player: { id: player.id, displayName: player.displayName, themePreference: player.themePreference, version: player.version },
    isSuperuser,
    accessToken,
  };
}

export async function requireUserContext() {
  const context = await getUserContext();
  if (!context) throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return context;
}
