"use client";

import { useMemo, useState } from "react";
import { formatPercent } from "@/lib/utils";

export type PodLeaderboardEntry = {
  player_id: string;
  display_name: string;
  games: number;
  wins: number;
  draws: number;
  win_rate: number;
  participation_share: number;
};

type Ranking = "played" | "wins" | "effective";

const tabs: { id: Ranking; label: string; description: string }[] = [
  { id: "played", label: "Most played", description: "Ranked by total game appearances." },
  { id: "wins", label: "Most wins", description: "Ranked by total games won." },
  { id: "effective", label: "Most effective", description: "Ranked by win rate. At least three games are required." },
];

function compareName(a: PodLeaderboardEntry, b: PodLeaderboardEntry) {
  return a.display_name.localeCompare(b.display_name);
}

export function sortPodLeaders(leaders: PodLeaderboardEntry[], ranking: Ranking) {
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

export function PodLeaderboard({ leaders }: { leaders: PodLeaderboardEntry[] }) {
  const [ranking, setRanking] = useState<Ranking>("effective");
  const activeTab = tabs.find((tab) => tab.id === ranking)!;
  const sorted = useMemo(() => sortPodLeaders(leaders, ranking).slice(0, 5), [leaders, ranking]);

  return <section aria-label="POD player leaderboard">
    <p className="text-xs font-bold tracking-[.16em] text-violet-300 uppercase">Leaderboard</p>
    <h2 className="font-display mt-1 text-2xl">Player rankings</h2>
    <div role="tablist" aria-label="Leaderboard ranking" className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-black/10 p-1">
      {tabs.map((tab) => <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={ranking === tab.id}
        onClick={() => setRanking(tab.id)}
        className={`min-h-8 shrink-0 rounded-lg px-2.5 text-[11px] font-semibold transition ${ranking === tab.id ? "bg-violet-300/15 text-violet-200" : "text-stone-500 hover:bg-white/6 hover:text-white"}`}
      >{tab.label}</button>)}
    </div>
    <p className="mt-3 text-xs text-stone-500">{activeTab.description}</p>
    <ol className="mt-5 grid gap-3">
      {sorted.map((leader, index) => {
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
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{leader.display_name}</p><p className="text-xs text-stone-500">{detail}</p></div>
          <div className="shrink-0 text-right"><p className="font-display text-lg text-amber-200">{primary}</p>{!eligible && <p className="text-[9px] font-bold tracking-wide text-stone-600 uppercase">Unranked</p>}</div>
        </li>;
      })}
      {!sorted.length && <li className="py-8 text-center text-sm text-stone-500">Play a game to start the board.</li>}
    </ol>
  </section>;
}
