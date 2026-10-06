import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { UserContext } from "@/lib/auth/server";
import { requirePodRole } from "@/lib/authorization";
import { AppError } from "@/lib/errors";
import type { PodAchievementLeaderboardEntry, PodLeaderboardEntry } from "@/lib/pod-rankings";

export interface MetricRange { from?: string; to?: string }

function dateCondition(range: MetricRange) {
  if (range.from && range.to) return sql`and g.played_at between ${range.from}::timestamptz and ${range.to}::timestamptz`;
  return sql``;
}

export async function podMetrics(context: UserContext, podId: string, range: MetricRange = {}) {
  await requirePodRole(context, podId, "GUEST");
  const condition = dateCondition(range);
  const db = getDb(context);
  const [summary, leaders, activity, activityByWeek, deckLeaders, brackets, powers, encounters, achievementLeaders] = await Promise.all([
    db.execute<{ games: number; recent_games: number; active_players: number; active_decks: number; average_table_size: number }>(sql`
      select count(distinct g.id)::int as games,
        count(distinct g.id) filter (where g.played_at >= now() - interval '30 days')::int as recent_games,
        (select count(*)::int
          from app.pod_memberships membership
          join app.players player on player.id = membership.player_id and player.archived_at is null
          where membership.pod_id = ${podId}::uuid
            and membership.status = 'ACTIVE'
            and membership.archived_at is null) as active_players,
        count(distinct gp.deck_id)::int as active_decks,
        coalesce(count(gp.player_id)::numeric / nullif(count(distinct g.id), 0), 0)::float as average_table_size
      from app.games g left join app.game_participants gp on gp.game_id = g.id
      where g.pod_id = ${podId}::uuid and g.archived_at is null ${condition}
    `),
    db.execute<{ player_id: string; display_name: string; games: number; wins: number; draws: number; win_rate: number; participation_share: number }>(sql`
      select p.id as player_id, p.display_name,
        count(*)::int as games,
        count(*) filter (where gp.is_winner)::int as wins,
        count(*) filter (where g.result_kind = 'DRAW')::int as draws,
        coalesce(count(*) filter (where gp.is_winner)::numeric / nullif(count(*), 0), 0)::float as win_rate,
        0::float as participation_share
      from app.game_participants gp
      join app.games g on g.id = gp.game_id and g.archived_at is null
      join app.players p on p.id = gp.player_id
      where g.pod_id = ${podId}::uuid ${condition}
      group by p.id, p.display_name
      order by (count(*) >= 3) desc, win_rate desc, games desc, p.display_name
    `),
    db.execute<{ period: string; games: number }>(sql`
      select date_trunc('month', g.played_at)::date::text as period, count(*)::int as games
      from app.games g where g.pod_id = ${podId}::uuid and g.archived_at is null ${condition}
      group by 1 order by 1
    `),
    db.execute<{ period: string; games: number }>(sql`
      select date_trunc('week', g.played_at)::date::text as period, count(*)::int as games
      from app.games g where g.pod_id = ${podId}::uuid and g.archived_at is null ${condition}
      group by 1 order by 1
    `),
    db.execute<{ deck_id: string; deck_name: string; owner_name: string; games: number; wins: number; win_rate: number }>(sql`
      select d.id as deck_id, d.name as deck_name, p.display_name as owner_name,
        count(*)::int as games,
        count(*) filter (where gp.is_winner)::int as wins,
        coalesce(count(*) filter (where gp.is_winner)::numeric / nullif(count(*), 0), 0)::float as win_rate
      from app.game_participants gp
      join app.games g on g.id = gp.game_id and g.archived_at is null
      join app.decks d on d.id = gp.deck_id
      join app.players p on p.id = d.owner_player_id
      where g.pod_id = ${podId}::uuid ${condition}
      group by d.id, d.name, d.owner_player_id, p.display_name
      order by (count(*) >= 3) desc, win_rate desc, games desc, d.name
    `),
    db.execute<{ bracket: number; appearances: number }>(sql`
      select gp.bracket_snapshot::int as bracket, count(*)::int as appearances
      from app.game_participants gp join app.games g on g.id = gp.game_id
      where g.pod_id = ${podId}::uuid and g.archived_at is null ${condition}
      group by gp.bracket_snapshot order by gp.bracket_snapshot
    `),
    db.execute<{ bucket: number; appearances: number }>(sql`
      select floor(gp.power_level_snapshot)::int as bucket, count(*)::int as appearances
      from app.game_participants gp join app.games g on g.id = gp.game_id
      where g.pod_id = ${podId}::uuid and g.archived_at is null
        and gp.power_level_snapshot is not null ${condition}
      group by 1 order by 1
    `),
    db.execute<{ player_a_id: string; player_a_name: string; player_b_id: string; player_b_name: string; games: number }>(sql`
      select a.player_id as player_a_id, pa.display_name as player_a_name,
        b.player_id as player_b_id, pb.display_name as player_b_name, count(*)::int as games
      from app.game_participants a
      join app.game_participants b on b.game_id = a.game_id and b.player_id > a.player_id
      join app.games g on g.id = a.game_id and g.archived_at is null
      join app.players pa on pa.id = a.player_id join app.players pb on pb.id = b.player_id
      where g.pod_id = ${podId}::uuid
        and private.game_players_are_opponents(g.id, a.player_id, b.player_id) ${condition}
      group by a.player_id, pa.display_name, b.player_id, pb.display_name
      order by games desc, pa.display_name, pb.display_name
    `),
    db.execute<{ player_id: string; display_name: string; earned: number; available: number; completion: number }>(sql`
      select p.id as player_id, p.display_name,
        count(distinct grant_row.achievement_id) filter (where grant_row.revoked_at is null and achievement.id is not null and g.id is not null)::int as earned,
        (select count(*)::int from app.achievements a where a.archived_at is null) as available,
        coalesce(count(distinct grant_row.achievement_id) filter (where grant_row.revoked_at is null and achievement.id is not null and g.id is not null)::numeric
          / nullif((select count(*) from app.achievements a where a.archived_at is null), 0), 0)::float as completion
      from app.pod_memberships membership
      join app.players p on p.id = membership.player_id
      left join app.pod_player_achievements grant_row on grant_row.pod_id = membership.pod_id and grant_row.player_id = membership.player_id
      left join app.achievements achievement on achievement.id = grant_row.achievement_id and achievement.archived_at is null
      left join app.games g on g.id = grant_row.game_id and g.archived_at is null ${condition}
      where membership.pod_id = ${podId}::uuid and membership.status = 'ACTIVE' and membership.archived_at is null
      group by p.id, p.display_name order by earned desc, p.display_name
    `),
  ]);
  return {
    summary: summary.rows[0] ?? { games: 0, recent_games: 0, active_players: 0, active_decks: 0, average_table_size: 0 },
    leaders: leaders.rows.map((row) => ({ ...row, participation_share: summary.rows[0]?.games ? row.games / summary.rows[0].games : 0 })),
    activity: activity.rows,
    activityByWeek: activityByWeek.rows,
    deckLeaders: deckLeaders.rows,
    brackets: brackets.rows,
    powers: powers.rows,
    encounters: encounters.rows,
    achievementLeaders: achievementLeaders.rows,
  };
}

export async function podLeaderboardMetrics(context: UserContext, podId: string, range: MetricRange = {}) {
  await requirePodRole(context, podId, "GUEST");
  const condition = dateCondition(range);
  const db = getDb(context);
  const [leaders, achievementLeaders] = await Promise.all([
    db.execute<Omit<PodLeaderboardEntry, "participation_share">>(sql`
      select p.id as player_id, p.display_name,
        count(*)::int as games,
        count(*) filter (where gp.is_winner)::int as wins,
        count(*) filter (where g.result_kind = 'DRAW')::int as draws,
        coalesce(count(*) filter (where gp.is_winner)::numeric / nullif(count(*), 0), 0)::float as win_rate
      from app.game_participants gp
      join app.games g on g.id = gp.game_id and g.archived_at is null
      join app.players p on p.id = gp.player_id
      where g.pod_id = ${podId}::uuid ${condition}
      group by p.id, p.display_name
    `),
    db.execute<PodAchievementLeaderboardEntry>(sql`
      select p.id as player_id, p.display_name,
        count(distinct grant_row.achievement_id) filter (where grant_row.revoked_at is null and achievement.id is not null and g.id is not null)::int as earned,
        (select count(*)::int from app.achievements a where a.archived_at is null) as available,
        coalesce(count(distinct grant_row.achievement_id) filter (where grant_row.revoked_at is null and achievement.id is not null and g.id is not null)::numeric
          / nullif((select count(*) from app.achievements a where a.archived_at is null), 0), 0)::float as completion
      from app.pod_memberships membership
      join app.players p on p.id = membership.player_id
      left join app.pod_player_achievements grant_row on grant_row.pod_id = membership.pod_id and grant_row.player_id = membership.player_id
      left join app.achievements achievement on achievement.id = grant_row.achievement_id and achievement.archived_at is null
      left join app.games g on g.id = grant_row.game_id and g.archived_at is null ${condition}
      where membership.pod_id = ${podId}::uuid and membership.status = 'ACTIVE' and membership.archived_at is null
      group by p.id, p.display_name
    `),
  ]);

  return {
    leaders: leaders.rows.map((leader) => ({ ...leader, participation_share: 0 })),
    achievementLeaders: achievementLeaders.rows,
  };
}

export async function playerMetrics(context: UserContext, playerId: string, podId?: string, range: MetricRange = {}) {
  if (playerId !== context.player.id && !podId) throw new AppError(404, "NOT_FOUND", "Player metrics require a shared POD.");
  if (podId) {
    await requirePodRole(context, podId, "GUEST");
    const membership = await getDb(context).execute(sql`
      select 1 from app.pod_memberships
      where pod_id = ${podId}::uuid and player_id = ${playerId}::uuid
      limit 1
    `);
    if (!membership.rows.length) throw new AppError(404, "NOT_FOUND", "Player not found in this POD.");
  }
  const condition = dateCondition(range);
  const podFilter = podId ? sql`and g.pod_id = ${podId}::uuid` : sql``;
  const db = getDb(context);
  const [summary, form, deckPerformance, brackets, powers, achievements] = await Promise.all([
    db.execute<{ games: number; wins: number; draws: number; losses: number; win_rate: number; participation_share: number; unique_opponents: number; active_decks: number }>(sql`
      with eligible_games as (
        select g.* from app.games g where g.archived_at is null ${podFilter} ${condition}
      ), appearances as (
        select g.*, gp.is_winner from eligible_games g join app.game_participants gp on gp.game_id = g.id
        where gp.player_id = ${playerId}::uuid
      )
      select count(*)::int as games,
        count(*) filter (where is_winner)::int as wins,
        count(*) filter (where result_kind = 'DRAW')::int as draws,
        count(*) filter (where result_kind = 'WIN' and not is_winner)::int as losses,
        coalesce(count(*) filter (where is_winner)::numeric / nullif(count(*), 0), 0)::float as win_rate,
        coalesce(count(*)::numeric / nullif((select count(*) from eligible_games), 0), 0)::float as participation_share,
        (select count(distinct gp2.player_id)::int
          from appearances a join app.game_participants gp2 on gp2.game_id = a.id
          where private.game_players_are_opponents(a.id, ${playerId}::uuid, gp2.player_id)) as unique_opponents,
        (select count(*)::int from app.decks d where d.owner_player_id = ${playerId}::uuid and d.archived_at is null) as active_decks
      from appearances
    `),
    db.execute<{ result: string; played_at: string }>(sql`
      select case when g.result_kind = 'DRAW' then 'D' when gp.is_winner then 'W' else 'L' end as result,
        g.played_at::text as played_at
      from app.games g join app.game_participants gp on gp.game_id = g.id
      where gp.player_id = ${playerId}::uuid and g.archived_at is null ${podFilter} ${condition}
      order by g.played_at desc limit 10
    `),
    db.execute<{ deck_id: string; deck_name: string; games: number; wins: number; win_rate: number }>(sql`
      select gp.deck_id, max(gp.deck_name_snapshot) as deck_name, count(*)::int as games,
        count(*) filter (where gp.is_winner)::int as wins,
        coalesce(count(*) filter (where gp.is_winner)::numeric / nullif(count(*), 0), 0)::float as win_rate
      from app.game_participants gp join app.games g on g.id = gp.game_id
      where gp.player_id = ${playerId}::uuid and g.archived_at is null ${podFilter} ${condition}
      group by gp.deck_id order by games desc, wins desc
    `),
    db.execute<{ bracket: number; appearances: number }>(sql`
      select gp.bracket_snapshot::int as bracket, count(*)::int as appearances
      from app.game_participants gp join app.games g on g.id = gp.game_id
      where gp.player_id = ${playerId}::uuid and g.archived_at is null ${podFilter} ${condition}
      group by gp.bracket_snapshot order by gp.bracket_snapshot
    `),
    db.execute<{ power: number; appearances: number }>(sql`
      select round(gp.power_level_snapshot, 1)::float as power, count(*)::int as appearances
      from app.game_participants gp join app.games g on g.id = gp.game_id
      where gp.player_id = ${playerId}::uuid and g.archived_at is null
        and gp.power_level_snapshot is not null ${podFilter} ${condition}
      group by 1 order by 1
    `),
    db.execute<{ earned: number; available: number }>(podId ? sql`
      select count(*) filter (where grant_row.revoked_at is null)::int as earned,
        (select count(*)::int from app.achievements where archived_at is null) as available
      from app.pod_player_achievements grant_row
      join app.achievements achievement on achievement.id = grant_row.achievement_id and achievement.archived_at is null
      join app.games g on g.id = grant_row.game_id and g.archived_at is null
      where grant_row.pod_id = ${podId}::uuid and grant_row.player_id = ${playerId}::uuid ${condition}
    ` : sql`
      select count(*) filter (where grant_row.revoked_at is null)::int as earned,
        ((select count(*) from app.achievements where archived_at is null)
          * (select count(*) from app.pod_memberships membership join app.pods pod on pod.id = membership.pod_id where membership.player_id = ${playerId}::uuid and membership.status = 'ACTIVE' and membership.archived_at is null and pod.archived_at is null))::int as available
      from app.pod_player_achievements grant_row
      join app.achievements achievement on achievement.id = grant_row.achievement_id and achievement.archived_at is null
      join app.games g on g.id = grant_row.game_id and g.archived_at is null
      where grant_row.player_id = ${playerId}::uuid ${condition}
    `),
  ]);
  const base = summary.rows[0] ?? { games: 0, wins: 0, draws: 0, losses: 0, win_rate: 0, participation_share: 0, unique_opponents: 0, active_decks: 0 };
  const achievement = achievements.rows[0] ?? { earned: 0, available: 0 };
  return { ...base, recentForm: form.rows, deckPerformance: deckPerformance.rows, brackets: brackets.rows, powers: powers.rows, achievements: { ...achievement, completion: achievement.available ? achievement.earned / achievement.available : 0 } };
}

export interface OwnedDeckSummary {
  deck_id: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  win_rate: number;
  last_played: string | null;
  last_played_timezone: string | null;
}

export async function ownedDeckSummaries(context: UserContext) {
  const result = await getDb(context).execute<OwnedDeckSummary & Record<string, unknown>>(sql`
    select deck.id as deck_id,
      count(game.id)::int as games,
      count(game.id) filter (where participant.is_winner)::int as wins,
      count(game.id) filter (where game.result_kind = 'DRAW')::int as draws,
      count(game.id) filter (where game.result_kind = 'WIN' and not participant.is_winner)::int as losses,
      coalesce(count(game.id) filter (where participant.is_winner)::numeric
        / nullif(count(game.id), 0), 0)::float as win_rate,
      max(game.played_at)::text as last_played,
      (array_agg(pod.timezone order by game.played_at desc) filter (where game.id is not null))[1] as last_played_timezone
    from app.decks deck
    left join app.game_participants participant on participant.deck_id = deck.id
    left join app.games game on game.id = participant.game_id and game.archived_at is null
    left join app.pods pod on pod.id = game.pod_id
    where deck.owner_player_id = ${context.player.id}::uuid
    group by deck.id, deck.owner_player_id
  `);
  return result.rows;
}

export async function deckMetrics(context: UserContext, deckId: string, podId?: string, range: MetricRange = {}) {
  const condition = dateCondition(range);
  const podFilter = podId ? sql`and g.pod_id = ${podId}::uuid` : sql``;
  const db = getDb(context);
  const [summary, form, snapshots] = await Promise.all([
    db.execute<{ owner_player_id: string; games: number; wins: number; draws: number; losses: number; win_rate: number; last_played: string | null }>(sql`
      select d.owner_player_id,
        count(g.id)::int as games,
        count(g.id) filter (where gp.is_winner)::int as wins,
        count(g.id) filter (where g.result_kind = 'DRAW')::int as draws,
        count(g.id) filter (where g.result_kind = 'WIN' and not gp.is_winner)::int as losses,
        coalesce(count(g.id) filter (where gp.is_winner)::numeric / nullif(count(g.id), 0), 0)::float as win_rate,
        max(g.played_at)::text as last_played
      from app.decks d left join app.game_participants gp on gp.deck_id = d.id
      left join app.games g on g.id = gp.game_id and g.archived_at is null ${condition} ${podFilter}
      where d.id = ${deckId}::uuid group by d.owner_player_id
    `),
    db.execute<{ result: string; played_at: string }>(sql`
      select case when g.result_kind = 'DRAW' then 'D' when gp.is_winner then 'W' else 'L' end as result,
        g.played_at::text as played_at
      from app.decks d join app.game_participants gp on gp.deck_id = d.id join app.games g on g.id = gp.game_id
      where d.id = ${deckId}::uuid and g.archived_at is null ${podFilter} ${condition}
      order by g.played_at desc limit 10
    `),
    db.execute<{ bracket: number; power_level: number | null; appearances: number }>(sql`
      select gp.bracket_snapshot::int as bracket, gp.power_level_snapshot::float as power_level, count(*)::int as appearances
      from app.game_participants gp join app.games g on g.id = gp.game_id
      where gp.deck_id = ${deckId}::uuid and g.archived_at is null ${podFilter} ${condition}
      group by gp.bracket_snapshot, gp.power_level_snapshot order by appearances desc
    `),
  ]);
  const row = summary.rows[0];
  if (!row) return null;
  if (row.owner_player_id !== context.player.id && podId) await requirePodRole(context, podId, "GUEST");
  if (row.owner_player_id !== context.player.id && !podId) return null;
  return { ...row, recentForm: form.rows, snapshotDistribution: snapshots.rows };
}
