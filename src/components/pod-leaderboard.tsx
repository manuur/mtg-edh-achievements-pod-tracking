"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  sortPodAchievementLeaders,
  sortPodLeaders,
  type PodAchievementLeaderboardEntry,
  type PodGameRanking,
  type PodLeaderboardEntry,
} from "@/lib/pod-rankings";
import { formatPercent } from "@/lib/utils";

export { sortPodLeaders } from "@/lib/pod-rankings";
export type { PodAchievementLeaderboardEntry, PodLeaderboardEntry } from "@/lib/pod-rankings";

type Ranking = PodGameRanking | "achievements";

const tabs: { id: Ranking; label: string; description: string }[] = [
  { id: "played", label: "Most played", description: "Ranked by total game appearances." },
  { id: "wins", label: "Most wins", description: "Ranked by total games won." },
  { id: "effective", label: "Most effective", description: "Ranked by win rate. At least three games are required." },
  { id: "achievements", label: "Achievements", description: "Ranked by achievements earned, then completion percentage." },
];

export function PodLeaderboard({ leaders, achievementLeaders, podId }: {
  leaders: PodLeaderboardEntry[];
  achievementLeaders: PodAchievementLeaderboardEntry[];
  podId: string;
}) {
  const [ranking, setRanking] = useState<Ranking>("effective");
  const activeTab = tabs.find((tab) => tab.id === ranking)!;
  const sorted = useMemo(
    () => ranking === "achievements" ? [] : sortPodLeaders(leaders, ranking).slice(0, 5),
    [leaders, ranking],
  );
  const sortedAchievements = useMemo(
    () => sortPodAchievementLeaders(achievementLeaders).slice(0, 5),
    [achievementLeaders],
  );

  return <section aria-label="POD player leaderboard">
    <p className="text-xs font-bold tracking-[.16em] text-violet-300 uppercase">Leaderboard</p>
    <h2 className="font-display mt-1 text-2xl">Player rankings</h2>
    <div role="tablist" aria-label="Leaderboard ranking" className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-black/10 p-1 sm:flex sm:overflow-x-auto">
      {tabs.map((tab) => <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={ranking === tab.id}
        onClick={() => setRanking(tab.id)}
        className={`min-h-10 min-w-0 rounded-lg px-2.5 text-[11px] font-semibold transition sm:min-h-8 sm:shrink-0 ${ranking === tab.id ? "bg-violet-300/15 text-violet-200" : "text-stone-500 hover:bg-white/6 hover:text-white"}`}
      >{tab.label}</button>)}
    </div>
    <p className="mt-3 text-xs text-stone-500">{activeTab.description}</p>
    <ol className="mt-5 grid gap-3">
      {ranking === "achievements" ? sortedAchievements.map((leader, index) => <li key={leader.player_id} className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/6 text-xs font-bold text-stone-400">{index + 1}</span>
        <div className="min-w-0 flex-1"><Link href={`/players/${leader.player_id}?podId=${podId}`} className="block truncate text-sm font-semibold hover:text-amber-200 focus-visible:text-amber-200">{leader.display_name}</Link><p className="text-xs text-stone-500">{formatPercent(leader.completion)} complete · {leader.available} available</p></div>
        <p className="font-display shrink-0 text-lg text-amber-200">{leader.earned} earned</p>
      </li>) : sorted.map((leader, index) => {
        const eligible = ranking !== "effective" || leader.games >= 3;
        const primary = ranking === "played"
          ? `${leader.games} games`
          : ranking === "wins"
            ? `${leader.wins} wins`
            : formatPercent(leader.win_rate || 0);
        const detail = ranking === "played"
          ? `${leader.wins} wins · ${formatPercent(leader.win_rate || 0)} win rate`
          : ranking === "wins"
            ? `${leader.games} games · ${formatPercent(leader.win_rate || 0)} win rate`
            : `${leader.wins} wins · ${leader.games} games`;
        return <li key={leader.player_id} className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/6 text-xs font-bold text-stone-400">{eligible ? index + 1 : "—"}</span>
          <div className="min-w-0 flex-1"><Link href={`/players/${leader.player_id}?podId=${podId}`} className="block truncate text-sm font-semibold hover:text-amber-200 focus-visible:text-amber-200">{leader.display_name}</Link><p className="text-xs text-stone-500">{detail}</p></div>
          <div className="shrink-0 text-right"><p className="font-display text-lg text-amber-200">{primary}</p>{!eligible && <p className="text-[9px] font-bold tracking-wide text-stone-600 uppercase">Unranked</p>}</div>
        </li>;
      })}
      {ranking === "achievements" && !sortedAchievements.length && <li className="py-8 text-center text-sm text-stone-500">Add POD members to start the board.</li>}
      {ranking !== "achievements" && !sorted.length && <li className="py-8 text-center text-sm text-stone-500">Play a game to start the board.</li>}
    </ol>
  </section>;
}
