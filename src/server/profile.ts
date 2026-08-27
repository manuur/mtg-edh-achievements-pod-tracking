import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db/client";
import { players, podMemberships } from "@/db/schema";
import type { UserContext } from "@/lib/auth/server";
import { requirePodRole, writeAudit } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import type { updateProfileSchema, updateThemePreferenceSchema } from "@/lib/validation";

export async function getProfile(context: UserContext) {
  const profile = await getDb(context).query.players.findFirst({ where: eq(players.id, context.player.id) });
  if (!profile) throw new AppError(404, "NOT_FOUND", "Profile not found.");
  return { id: profile.id, displayName: profile.displayName, email: context.user.email, themePreference: profile.themePreference, version: profile.version };
}

export async function getSharedPlayer(context: UserContext, playerId: string, podId?: string) {
  if (playerId !== context.player.id) {
    if (!podId) throw new AppError(404, "NOT_FOUND", "Player not found.");
    await requirePodRole(context, podId, "GUEST");
    const membership = await getDb(context).query.podMemberships.findFirst({
      where: and(eq(podMemberships.podId, podId), eq(podMemberships.playerId, playerId)),
    });
    if (!membership) throw new AppError(404, "NOT_FOUND", "Player not found in this POD.");
  }
  const player = await getDb(context).query.players.findFirst({ where: eq(players.id, playerId) });
  if (!player) throw new AppError(404, "NOT_FOUND", "Player not found.");
  return { id: player.id, displayName: player.displayName, archivedAt: player.archivedAt };
}

export async function updateProfile(context: UserContext, input: z.infer<typeof updateProfileSchema>) {
  const [updated] = await getDb(context).update(players).set({
    displayName: input.displayName,
    updatedAt: new Date(),
    version: input.version + 1,
  }).where(and(eq(players.id, context.player.id), eq(players.version, input.version))).returning({
    id: players.id, displayName: players.displayName, version: players.version,
  });
  if (!updated) throw new AppError(409, "CONFLICT", "Your profile changed in another session.");
  await writeAudit({ context, action: "PROFILE_UPDATED", entityType: "player", entityId: context.player.id });
  return { ...updated, email: context.user.email };
}

export async function updateThemePreference(context: UserContext, input: z.infer<typeof updateThemePreferenceSchema>) {
  const [updated] = await getDb(context).update(players).set({
    themePreference: input.themePreference,
    updatedAt: new Date(),
    version: input.version + 1,
  }).where(and(eq(players.id, context.player.id), eq(players.version, input.version))).returning({
    id: players.id,
    themePreference: players.themePreference,
    version: players.version,
  });
  if (!updated) throw new AppError(409, "CONFLICT", "Your theme preference changed in another session.");
  await writeAudit({ context, action: "PROFILE_THEME_UPDATED", entityType: "player", entityId: context.player.id, metadata: { themePreference: updated.themePreference } });
  return updated;
}
