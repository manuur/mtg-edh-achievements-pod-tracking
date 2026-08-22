import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { decks, players, podMemberships, pods } from "@/db/schema";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { requirePodRole, writeAudit } from "@/lib/authorization";
import type { z } from "zod";
import type { createDeckSchema, updateDeckSchema } from "@/lib/validation";

async function canManageOwner(context: UserContext, ownerPlayerId: string) {
  if (context.player.id === ownerPlayerId) return true;
  const actor = alias(podMemberships, "actor_membership");
  const owner = alias(podMemberships, "owner_membership");
  const [shared] = await getDb(context).select({ podId: actor.podId }).from(actor)
    .innerJoin(owner, and(eq(owner.podId, actor.podId), eq(owner.playerId, ownerPlayerId), eq(owner.status, "ACTIVE"), isNull(owner.archivedAt)))
    .innerJoin(pods, and(eq(pods.id, actor.podId), isNull(pods.archivedAt)))
    .where(and(eq(actor.playerId, context.player.id), eq(actor.status, "ACTIVE"), isNull(actor.archivedAt), inArray(actor.role, ["ADMIN", "EDITOR"])))
    .limit(1);
  return Boolean(shared);
}

export async function listDecks(context: UserContext, ownerPlayerId?: string, podId?: string, includeArchived = false) {
  const db = getDb(context);
  if (podId) {
    await requirePodRole(context, podId, "GUEST");
    return db.select({ deck: decks, ownerName: players.displayName }).from(decks)
      .innerJoin(players, eq(players.id, decks.ownerPlayerId))
      .innerJoin(podMemberships, and(
        eq(podMemberships.playerId, decks.ownerPlayerId),
        eq(podMemberships.podId, podId),
        eq(podMemberships.status, "ACTIVE"),
        isNull(podMemberships.archivedAt),
      ))
      .where(and(includeArchived ? undefined : isNull(decks.archivedAt), ownerPlayerId ? eq(decks.ownerPlayerId, ownerPlayerId) : undefined)).orderBy(asc(players.displayName), asc(decks.name));
  }
  const owner = ownerPlayerId ?? context.player.id;
  if (owner !== context.player.id && !await canManageOwner(context, owner)) throw new AppError(403, "FORBIDDEN", "You cannot view this deck collection.");
  return db.select({ deck: decks, ownerName: players.displayName }).from(decks).innerJoin(players, eq(players.id, decks.ownerPlayerId))
    .where(and(eq(decks.ownerPlayerId, owner), includeArchived ? undefined : isNull(decks.archivedAt))).orderBy(asc(decks.name));
}

export async function canManageDeck(context: UserContext, deckId: string) {
  const row = await getDb(context).query.decks.findFirst({ where: eq(decks.id, deckId) });
  return Boolean(row && await canManageOwner(context, row.ownerPlayerId));
}

export async function getDeck(context: UserContext, deckId: string, podId?: string) {
  const row = await getDb(context).query.decks.findFirst({ where: eq(decks.id, deckId) });
  if (!row) throw new AppError(404, "NOT_FOUND", "Deck not found.");
  if (!await canManageOwner(context, row.ownerPlayerId)) {
    if (!podId) throw new AppError(404, "NOT_FOUND", "Deck not found.");
    await requirePodRole(context, podId, "GUEST");
    const ownerMembership = await getDb(context).query.podMemberships.findFirst({ where: and(
      eq(podMemberships.podId, podId), eq(podMemberships.playerId, row.ownerPlayerId), eq(podMemberships.status, "ACTIVE"), isNull(podMemberships.archivedAt),
    ) });
    if (!ownerMembership) throw new AppError(404, "NOT_FOUND", "Deck not found in this POD.");
  }
  return row;
}

export async function createDeck(context: UserContext, input: z.infer<typeof createDeckSchema>) {
  if (!await canManageOwner(context, input.ownerPlayerId)) throw new AppError(403, "FORBIDDEN", "You cannot create a deck for that player.");
  const [created] = await getDb(context).insert(decks).values({ ...input, moxfieldUrl: input.moxfieldUrl, createdByPlayerId: context.player.id }).returning();
  await writeAudit({ context, action: "DECK_CREATED", entityType: "deck", entityId: created.id, metadata: { ownerPlayerId: created.ownerPlayerId } });
  return created;
}

export async function updateDeck(context: UserContext, deckId: string, input: z.infer<typeof updateDeckSchema>) {
  const current = await getDb(context).query.decks.findFirst({ where: eq(decks.id, deckId) });
  if (!current || !await canManageOwner(context, current.ownerPlayerId)) throw new AppError(404, "NOT_FOUND", "Deck not found.");
  const [updated] = await getDb(context).update(decks).set({
    ...(input.name !== undefined && { name: input.name }), ...(input.bracket !== undefined && { bracket: input.bracket }),
    ...(input.powerLevel !== undefined && { powerLevel: input.powerLevel }), ...(input.moxfieldUrl !== undefined && { moxfieldUrl: input.moxfieldUrl }),
    ...(input.archived !== undefined && { archivedAt: input.archived ? new Date() : null }),
    updatedAt: new Date(), version: input.version + 1,
  }).where(and(eq(decks.id, deckId), eq(decks.version, input.version))).returning();
  if (!updated) throw new AppError(409, "CONFLICT", "The deck was changed by someone else.");
  await writeAudit({ context, action: input.archived === true ? "DECK_ARCHIVED" : input.archived === false ? "DECK_RESTORED" : "DECK_UPDATED", entityType: "deck", entityId: deckId });
  return updated;
}
