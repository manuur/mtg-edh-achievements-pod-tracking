import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditEvents, podMemberships, pods } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { PodRole } from "@/lib/validation";
import type { UserContext } from "@/lib/auth/server";

const rank: Record<PodRole, number> = { GUEST: 0, EDITOR: 1, ADMIN: 2 };

export async function getActiveMembership(context: UserContext, podId: string, playerId: string) {
  return getDb(context).query.podMemberships.findFirst({
    where: and(
      eq(podMemberships.podId, podId),
      eq(podMemberships.playerId, playerId),
      eq(podMemberships.status, "ACTIVE"),
      isNull(podMemberships.archivedAt),
    ),
  });
}

export async function requirePodRole(context: UserContext, podId: string, minimum: PodRole, allowArchivedPod = false) {
  const membership = await getActiveMembership(context, podId, context.player.id);
  if (!membership || rank[membership.role] < rank[minimum]) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  if (!allowArchivedPod) {
    const pod = await getDb(context).query.pods.findFirst({ where: and(eq(pods.id, podId), isNull(pods.archivedAt)) });
    if (!pod) throw new AppError(404, "NOT_FOUND", "POD not found.");
  }
  return membership;
}

export function requireSuperuser(context: UserContext) {
  if (!context.isSuperuser) throw new AppError(403, "FORBIDDEN", "Superadmin access is required.");
}

export async function writeAudit(input: {
  context: UserContext;
  action: string;
  entityType: string;
  entityId: string;
  podId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await getDb(input.context).insert(auditEvents).values({
    actorPlayerId: input.context.player.id,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    podId: input.podId ?? null,
    metadata: input.metadata ?? {},
  });
}
