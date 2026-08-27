export type PodLeaderboardEntry = {
  player_id: string;
  display_name: string;
  games: number;
  wins: number;
  draws: number;
  win_rate: number;
  participation_share: number;
};

export type PodAchievementLeaderboardEntry = {
  player_id: string;
  display_name: string;
  earned: number;
  available: number;
  completion: number;
};

export type PodGameRanking = "played" | "wins" | "effective";

function compareName(a: { display_name: string }, b: { display_name: string }) {
  return a.display_name.localeCompare(b.display_name);
}

export function sortPodLeaders(leaders: PodLeaderboardEntry[], ranking: PodGameRanking) {
  return [...leaders].sort((a, b) => {
    if (ranking === "played") {
      return b.games - a.games || b.wins - a.wins || b.win_rate - a.win_rate || compareName(a, b);
    }
    if (ranking === "wins") {
      return b.wins - a.wins || b.win_rate - a.win_rate || b.games - a.games || compareName(a, b);
    }
    const eligibility = Number(b.games >= 3) - Number(a.games >= 3);
    return eligibility || b.win_rate - a.win_rate || b.games - a.games || b.wins - a.wins || compareName(a, b);
  });
}

export function sortPodAchievementLeaders(leaders: PodAchievementLeaderboardEntry[]) {
  return [...leaders].sort((a, b) =>
    b.earned - a.earned || b.completion - a.completion || compareName(a, b),
  );
}

export function getPodPlayerRanks(
  leaders: PodLeaderboardEntry[],
  achievementLeaders: PodAchievementLeaderboardEntry[],
  playerId: string,
) {
  const rank = <T extends { player_id: string }>(rows: T[]) => {
    const index = rows.findIndex((row) => row.player_id === playerId);
    return index === -1 ? null : index + 1;
  };
  const effectiveLeaders = sortPodLeaders(leaders, "effective").filter((leader) => leader.games >= 3);

  return {
    played: rank(sortPodLeaders(leaders, "played")),
    wins: rank(sortPodLeaders(leaders, "wins")),
    effective: rank(effectiveLeaders),
    achievements: rank(sortPodAchievementLeaders(achievementLeaders)),
    totals: {
      played: leaders.length,
      wins: leaders.length,
      effective: effectiveLeaders.length,
      achievements: achievementLeaders.length,
    },
  };
}
