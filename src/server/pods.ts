import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { assertDataApiResult, getAuthenticatedDataApi } from "@/db/data-api";
import { auditEvents, players, podMemberships, pods } from "@/db/schema";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { requirePodRole, writeAudit } from "@/lib/authorization";
import type { z } from "zod";
import type { addMemberSchema, createPodSchema, updateMemberSchema, updatePodSchema } from "@/lib/validation";

export async function listPods(context: UserContext, includeArchived = false) {
  const db = getDb(context);
  return db.select({
    id: pods.id,
    name: pods.name,
    timezone: pods.timezone,
    role: podMemberships.role,
    archivedAt: pods.archivedAt,
    version: pods.version,
  }).from(podMemberships)
    .innerJoin(pods, eq(pods.id, podMemberships.podId))
    .where(and(
      eq(podMemberships.playerId, context.player.id),
      eq(podMemberships.status, "ACTIVE"),
      isNull(podMemberships.archivedAt),
      includeArchived ? undefined : isNull(pods.archivedAt),
    ))
    .orderBy(asc(pods.name));
}

export async function getPod(context: UserContext, podId: string, allowArchived = false) {
  const membership = await requirePodRole(context, podId, "GUEST", allowArchived);
  const pod = await getDb(context).query.pods.findFirst({ where: eq(pods.id, podId) });
  if (!pod) throw new AppError(404, "NOT_FOUND", "POD not found.");
  return { ...pod, role: membership.role };
}

export async function createPod(context: UserContext, input: z.infer<typeof createPodSchema>) {
  const db = getDb(context);
  const podId = crypto.randomUUID();
  await db.batch([
    db.insert(pods).values({ id: podId, name: input.name, timezone: input.timezone, createdByPlayerId: context.player.id }),
    db.insert(podMemberships).values({ podId, playerId: context.player.id, role: "ADMIN" }),
    db.insert(auditEvents).values({ podId, actorPlayerId: context.player.id, action: "POD_CREATED", entityType: "pod", entityId: podId }),
  ]);
  return getPod(context, podId);
}

export async function updatePod(context: UserContext, podId: string, input: z.infer<typeof updatePodSchema>) {
  await requirePodRole(context, podId, "ADMIN");
  const [updated] = await getDb(context).update(pods).set({
    ...(input.name !== undefined && { name: input.name }),
    ...(input.timezone !== undefined && { timezone: input.timezone }),
    updatedAt: new Date(),
    version: input.version + 1,
  }).where(and(eq(pods.id, podId), eq(pods.version, input.version))).returning();
  if (!updated) throw new AppError(409, "CONFLICT", "The POD was changed by another administrator.");
  await writeAudit({ context, podId, action: "POD_UPDATED", entityType: "pod", entityId: podId });
  return updated;
}

export async function setPodArchived(context: UserContext, podId: string, archived: boolean, version: number) {
  await requirePodRole(context, podId, "ADMIN", true);
  const [updated] = await getDb(context).update(pods).set({
    archivedAt: archived ? new Date() : null,
    updatedAt: new Date(),
    version: version + 1,
  }).where(and(eq(pods.id, podId), eq(pods.version, version))).returning();
  if (!updated) throw new AppError(409, "CONFLICT", "The POD was changed by another administrator.");
  await writeAudit({ context, podId, action: archived ? "POD_ARCHIVED" : "POD_RESTORED", entityType: "pod", entityId: podId });
  return updated;
}

export async function listMembers(context: UserContext, podId: string) {
  await requirePodRole(context, podId, "GUEST");
  return getDb(context).select({
    playerId: players.id,
    displayName: players.displayName,
    claimed: sql<boolean>`${players.authUserId} is not null`.as("claimed"),
    role: podMemberships.role,
    status: podMemberships.status,
    version: podMemberships.version,
    archivedAt: podMemberships.archivedAt,
  }).from(podMemberships)
    .innerJoin(players, eq(players.id, podMemberships.playerId))
    .where(eq(podMemberships.podId, podId))
    .orderBy(asc(players.displayName));
}

export async function addMember(context: UserContext, podId: string, input: z.infer<typeof addMemberSchema>) {
  await requirePodRole(context, podId, "ADMIN");
  const dataApi = getAuthenticatedDataApi(context);
  if (dataApi) {
    const playerId = assertDataApiResult(await dataApi.rpc("add_pod_member", {
      p_pod_id: podId,
      p_actor_player_id: context.player.id,
      p_display_name: input.displayName,
      p_claim_email: input.email,
      p_role: input.role,
    })) as string | null;
    if (!playerId) throw new AppError(500, "INTERNAL_ERROR", "The POD member could not be added.");
    return { playerId };
  }
  const result = await getDb(context).execute<{ player_id: string }>(sql`
    select api.add_pod_member(
      ${podId}::uuid,
      ${context.player.id}::uuid,
      ${input.displayName},
      ${input.email},
      ${input.role}::app.pod_role
    ) as player_id
  `);
  const playerId = result.rows[0]?.player_id;
  if (!playerId) throw new AppError(500, "INTERNAL_ERROR", "The POD member could not be added.");
  return { playerId };
}

async function activeAdminCount(context: UserContext, podId: string) {
  const [row] = await getDb(context).select({ value: count() }).from(podMemberships).where(and(
    eq(podMemberships.podId, podId),
    eq(podMemberships.status, "ACTIVE"),
    eq(podMemberships.role, "ADMIN"),
    isNull(podMemberships.archivedAt),
  ));
  return row?.value ?? 0;
}

export async function updateMember(context: UserContext, podId: string, playerId: string, input: z.infer<typeof updateMemberSchema>) {
  await requirePodRole(context, podId, "ADMIN");
  const db = getDb(context);
  const current = await db.query.podMemberships.findFirst({
    where: and(eq(podMemberships.podId, podId), eq(podMemberships.playerId, playerId)),
  });
  if (!current) throw new AppError(404, "NOT_FOUND", "Member not found.");
  const removingAdmin = current.role === "ADMIN" && (input.role && input.role !== "ADMIN" || input.status === "ARCHIVED");
  if (removingAdmin && await activeAdminCount(context, podId) <= 1) {
    throw new AppError(409, "CONFLICT", "The final Administrator cannot be removed or demoted.");
  }
  if (input.claimEmail) {
    const dataApi = getAuthenticatedDataApi(context);
    if (dataApi) {
      assertDataApiResult(await dataApi.rpc("set_member_claim_email", {
        p_pod_id: podId,
        p_actor_player_id: context.player.id,
        p_player_id: playerId,
        p_claim_email: input.claimEmail,
      }));
    } else {
      await db.execute(sql`select api.set_member_claim_email(
        ${podId}::uuid,
        ${context.player.id}::uuid,
        ${playerId}::uuid,
        ${input.claimEmail}
      )`);
    }
    return current;
  }
  if (input.role && input.role !== "GUEST") {
    const target = await db.query.players.findFirst({ where: eq(players.id, playerId) });
    if (!target?.authUserId) throw new AppError(422, "VALIDATION_ERROR", "The player must claim their profile first.");
  }
  const [updated] = await db.update(podMemberships).set({
    ...(input.role && { role: input.role }),
    ...(input.status && { status: input.status, archivedAt: input.status === "ARCHIVED" ? new Date() : null }),
    updatedAt: new Date(), version: input.version + 1,
  }).where(and(eq(podMemberships.podId, podId), eq(podMemberships.playerId, playerId), eq(podMemberships.version, input.version))).returning();
  if (!updated) throw new AppError(409, "CONFLICT", "The membership was changed by another administrator.");
  await writeAudit({ context, podId, action: "MEMBER_UPDATED", entityType: "player", entityId: playerId, metadata: { role: input.role, status: input.status } });
  return updated;
}

export async function listAuditEvents(context: UserContext, podId: string, limit = 100) {
  await requirePodRole(context, podId, "ADMIN", true);
  const actor = players;
  return getDb(context).select({
    id: auditEvents.id,
    action: auditEvents.action,
    entityType: auditEvents.entityType,
    entityId: auditEvents.entityId,
    metadata: auditEvents.metadata,
    createdAt: auditEvents.createdAt,
    actorName: actor.displayName,
  }).from(auditEvents).leftJoin(actor, eq(actor.id, auditEvents.actorPlayerId))
    .where(eq(auditEvents.podId, podId)).orderBy(desc(auditEvents.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
}
