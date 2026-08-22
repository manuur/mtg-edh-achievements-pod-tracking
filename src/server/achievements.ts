import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { alias } from "drizzle-orm/pg-core";
import { achievements, auditEvents, players, podMemberships, podPlayerAchievements, pods } from "@/db/schema";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { requirePodRole, requireSuperuser, writeAudit } from "@/lib/authorization";
import { achievementSchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import type { z } from "zod";
import type { achievementGrantSchema, updateAchievementSchema } from "@/lib/validation";

export async function listCatalog(context: UserContext, includeArchived = false) {
  if (!context.isSuperuser) {
    const [membership] = await getDb(context).select({ podId: podMemberships.podId }).from(podMemberships)
      .innerJoin(pods, and(eq(pods.id, podMemberships.podId), isNull(pods.archivedAt)))
      .where(and(eq(podMemberships.playerId, context.player.id), eq(podMemberships.status, "ACTIVE"), isNull(podMemberships.archivedAt)))
      .limit(1);
    if (!membership) throw new AppError(403, "FORBIDDEN", "POD membership is required.");
  }
  return getDb(context).select().from(achievements)
    .where(includeArchived ? undefined : isNull(achievements.archivedAt))
    .orderBy(asc(achievements.category), asc(achievements.displayOrder), asc(achievements.name));
}

export async function createAchievement(context: UserContext, input: z.infer<typeof achievementSchema>) {
  requireSuperuser(context);
  const [created] = await getDb(context).insert(achievements).values({ ...input, createdByPlayerId: context.player.id }).returning();
  await writeAudit({ context, action: "ACHIEVEMENT_CREATED", entityType: "achievement", entityId: created.id });
  return created;
}

export async function updateAchievement(context: UserContext, achievementId: string, input: z.infer<typeof updateAchievementSchema>) {
  requireSuperuser(context);
  const [updated] = await getDb(context).update(achievements).set({
    ...(input.code !== undefined && { code: input.code }), ...(input.name !== undefined && { name: input.name }),
    ...(input.description !== undefined && { description: input.description }), ...(input.category !== undefined && { category: input.category }),
    ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
    ...(input.archived !== undefined && { archivedAt: input.archived ? new Date() : null }),
    updatedAt: new Date(), version: input.version + 1,
  }).where(and(eq(achievements.id, achievementId), eq(achievements.version, input.version))).returning();
  if (!updated) throw new AppError(409, "CONFLICT", "The achievement was changed by someone else.");
  await writeAudit({ context, action: input.archived === true ? "ACHIEVEMENT_ARCHIVED" : input.archived === false ? "ACHIEVEMENT_RESTORED" : "ACHIEVEMENT_UPDATED", entityType: "achievement", entityId: achievementId });
  return updated;
}

export interface AchievementCsvRow { code?: string; name: string; description?: string; category?: string; display_order?: string | number }

export function parseAchievementCsv(text: string) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new AppError(422, "VALIDATION_ERROR", "The CSV must contain a header and at least one row.");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const nameIndex = headers.indexOf("name");
  if (nameIndex === -1) throw new AppError(422, "VALIDATION_ERROR", "The CSV requires a name column.");
  const records = rows.slice(1).filter((row) => row.some(Boolean)).map((row, index) => {
    const get = (name: string) => row[headers.indexOf(name)]?.trim() ?? "";
    return achievementSchema.parse({
      code: get("code") || slugify(get("name")), name: get("name"), description: get("description"),
      category: get("category") || "General", displayOrder: Number(get("display_order") || index * 10),
    });
  });
  if (!records.length) throw new AppError(422, "VALIDATION_ERROR", "The CSV does not contain any achievement rows.");
  const codes = new Set<string>();
  for (const record of records) {
    if (codes.has(record.code)) throw new AppError(422, "VALIDATION_ERROR", `Duplicate achievement code: ${record.code}`);
    codes.add(record.code);
  }
  return records;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (quoted) throw new AppError(422, "VALIDATION_ERROR", "The CSV contains an unclosed quoted field.");
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function importAchievements(context: UserContext, text: string) {
  requireSuperuser(context);
  const records = parseAchievementCsv(text);
  const db = getDb(context);
  await db.batch([
    db.insert(achievements).values(records.map((record) => ({ ...record, createdByPlayerId: context.player.id }))),
    db.insert(auditEvents).values({ actorPlayerId: context.player.id, action: "ACHIEVEMENTS_IMPORTED", entityType: "achievement", entityId: "bulk", metadata: { count: records.length } }),
  ]);
  return { count: records.length, records };
}

export async function listPodAchievements(context: UserContext, podId: string) {
  await requirePodRole(context, podId, "GUEST");
  const catalog = await getDb(context).select().from(achievements).orderBy(asc(achievements.category), asc(achievements.displayOrder));
  const members = await getDb(context).select({ id: players.id, displayName: players.displayName }).from(podMemberships).innerJoin(players, eq(players.id, podMemberships.playerId))
    .where(and(eq(podMemberships.podId, podId), eq(podMemberships.status, "ACTIVE"), isNull(podMemberships.archivedAt))).orderBy(asc(players.displayName));
  const grantor = alias(players, "achievement_grantor");
  const revoker = alias(players, "achievement_revoker");
  const grants = await getDb(context).select({
    podId: podPlayerAchievements.podId,
    playerId: podPlayerAchievements.playerId,
    achievementId: podPlayerAchievements.achievementId,
    grantedByPlayerId: podPlayerAchievements.grantedByPlayerId,
    grantedByName: grantor.displayName,
    grantedAt: podPlayerAchievements.grantedAt,
    notes: podPlayerAchievements.notes,
    revokedByPlayerId: podPlayerAchievements.revokedByPlayerId,
    revokedByName: revoker.displayName,
    revokedAt: podPlayerAchievements.revokedAt,
    version: podPlayerAchievements.version,
  }).from(podPlayerAchievements)
    .innerJoin(grantor, eq(grantor.id, podPlayerAchievements.grantedByPlayerId))
    .leftJoin(revoker, eq(revoker.id, podPlayerAchievements.revokedByPlayerId))
    .where(eq(podPlayerAchievements.podId, podId));
  return { catalog, members, grants };
}

export async function grantAchievement(context: UserContext, podId: string, input: z.infer<typeof achievementGrantSchema>) {
  await requirePodRole(context, podId, "EDITOR");
  const member = await getDb(context).query.podMemberships.findFirst({ where: and(eq(podMemberships.podId, podId), eq(podMemberships.playerId, input.playerId), eq(podMemberships.status, "ACTIVE"), isNull(podMemberships.archivedAt)) });
  if (!member) throw new AppError(422, "VALIDATION_ERROR", "Achievements can only be granted to active POD players.");
  const achievement = await getDb(context).query.achievements.findFirst({ where: and(eq(achievements.id, input.achievementId), isNull(achievements.archivedAt)) });
  if (!achievement) throw new AppError(422, "VALIDATION_ERROR", "Only active catalog achievements can be granted.");
  const [grant] = await getDb(context).insert(podPlayerAchievements).values({
    podId, playerId: input.playerId, achievementId: input.achievementId, grantedByPlayerId: context.player.id, notes: input.notes,
  }).onConflictDoUpdate({
    target: [podPlayerAchievements.podId, podPlayerAchievements.playerId, podPlayerAchievements.achievementId],
    set: { grantedByPlayerId: context.player.id, grantedAt: new Date(), notes: input.notes, revokedByPlayerId: null, revokedAt: null, version: sql`${podPlayerAchievements.version} + 1` },
  }).returning();
  await writeAudit({ context, podId, action: "ACHIEVEMENT_GRANTED", entityType: "achievement_grant", entityId: `${input.playerId}:${input.achievementId}` });
  return grant;
}

export async function revokeAchievement(context: UserContext, podId: string, playerId: string, achievementId: string, version: number) {
  await requirePodRole(context, podId, "EDITOR");
  const [grant] = await getDb(context).update(podPlayerAchievements).set({ revokedByPlayerId: context.player.id, revokedAt: new Date(), version: version + 1 })
    .where(and(eq(podPlayerAchievements.podId, podId), eq(podPlayerAchievements.playerId, playerId), eq(podPlayerAchievements.achievementId, achievementId), eq(podPlayerAchievements.version, version))).returning();
  if (!grant) throw new AppError(409, "CONFLICT", "The achievement grant changed before it could be revoked.");
  await writeAudit({ context, podId, action: "ACHIEVEMENT_REVOKED", entityType: "achievement_grant", entityId: `${playerId}:${achievementId}` });
  return grant;
}
