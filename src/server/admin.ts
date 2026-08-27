import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { players } from "@/db/schema";
import { requireSuperuser } from "@/lib/authorization";
import type { UserContext } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";

export interface AdminUserSummary extends Record<string, unknown> {
  id: string;
  displayName: string;
  email: string | null;
  claimed: boolean;
  archivedAt: string | null;
  createdAt: string;
  version: number;
  podCount: number;
  deckCount: number;
  gameCount: number;
  achievementCount: number;
  isSuperadmin: boolean;
}

export interface HardDeletePlayerResult {
  id: string;
  displayName: string;
  gamesDeleted: number;
  decksDeleted: number;
  membershipsDeleted: number;
  grantsDeleted: number;
  adminPodsTakenOver: number;
  authAccountDeleted: boolean;
}

export async function listAdminUsers(context: UserContext) {
  requireSuperuser(context);
  const result = await getDb().execute<AdminUserSummary>(sql`
    select
      player.id,
      player.display_name as "displayName",
      claim.email_normalized as email,
      (player.auth_user_id is not null) as claimed,
      player.archived_at as "archivedAt",
      player.created_at as "createdAt",
      player.version,
      (select count(*)::integer from app.pod_memberships membership where membership.player_id = player.id) as "podCount",
      (select count(*)::integer from app.decks deck where deck.owner_player_id = player.id) as "deckCount",
      (select count(distinct participant.game_id)::integer from app.game_participants participant where participant.player_id = player.id) as "gameCount",
      (select count(*)::integer from app.pod_player_achievements grant_row where grant_row.player_id = player.id) as "achievementCount",
      exists (
        select 1 from private.app_superuser superadmin
        where superadmin.auth_user_id = player.auth_user_id
      ) as "isSuperadmin"
    from app.players player
    left join private.player_claim_emails claim on claim.player_id = player.id
    order by
      exists (select 1 from private.app_superuser superadmin where superadmin.auth_user_id = player.auth_user_id) desc,
      lower(player.display_name),
      player.created_at
  `);
  return result.rows;
}

export async function hardDeletePlayer(
  context: UserContext,
  playerId: string,
  input: { version: number; confirmation: string },
) {
  requireSuperuser(context);
  const target = await getDb().query.players.findFirst({ where: eq(players.id, playerId) });
  if (!target) throw new AppError(404, "NOT_FOUND", "Player not found.");
  if (target.id === context.player.id) {
    throw new AppError(403, "FORBIDDEN", "The singleton Superadmin cannot delete their own account.");
  }

  const result = await getDb().execute<{ result: HardDeletePlayerResult }>(sql`
    select private.hard_delete_player(
      ${context.user.id},
      ${playerId}::uuid,
      ${input.version},
      ${input.confirmation}
    ) as result
  `);
  const deleted = result.rows[0]?.result;
  if (!deleted) throw new AppError(500, "INTERNAL_ERROR", "The player could not be permanently deleted.");
  return deleted;
}
