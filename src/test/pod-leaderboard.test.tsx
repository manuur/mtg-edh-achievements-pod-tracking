import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PodLeaderboard, type PodAchievementLeaderboardEntry, type PodLeaderboardEntry } from "@/components/pod-leaderboard";
import { getPodPlayerRanks } from "@/lib/pod-rankings";

const leader = (player_id: string, display_name: string, games: number, wins: number): PodLeaderboardEntry => ({
  player_id,
  display_name,
  games,
  wins,
  draws: 0,
  win_rate: games ? wins / games : 0,
  participation_share: 0,
});

const leaders = [
  leader("4", "Manu", 16, 2),
  leader("2", "Tito", 16, 4),
  leader("5", "Mecha", 9, 1),
  leader("1", "Mati", 16, 7),
  leader("3", "Juan", 7, 1),
];

const achievementLeaders: PodAchievementLeaderboardEntry[] = [
  { player_id: "1", display_name: "Mati", earned: 7, available: 10, completion: 0.7 },
  { player_id: "2", display_name: "Tito", earned: 4, available: 10, completion: 0.4 },
  { player_id: "3", display_name: "Juan", earned: 8, available: 10, completion: 0.8 },
  { player_id: "4", display_name: "Manu", earned: 2, available: 10, completion: 0.2 },
  { player_id: "5", display_name: "Mecha", earned: 1, available: 10, completion: 0.1 },
];

function renderLeaderboard(gameLeaders = leaders, achievements = achievementLeaders) {
  return render(<PodLeaderboard podId="pod-1" leaders={gameLeaders} achievementLeaders={achievements} />);
}

function rankedNames() {
  return screen.getAllByRole("listitem").map((row) => row.querySelector("a")?.textContent);
}

describe("POD leaderboard", () => {
  it("makes the formulas explicit and switches between games, wins, efficiency, and achievements", async () => {
    renderLeaderboard();

    expect(screen.getByRole("tab", { name: "Most effective" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Ranked by win rate. At least three games are required.")).toBeInTheDocument();
    expect(rankedNames()).toEqual(["Mati", "Tito", "Juan", "Manu", "Mecha"]);
    expect(screen.getByText("43.8%")).toBeInTheDocument();
    expect(screen.getByText("7 wins · 16 games")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Most wins" }));
    expect(rankedNames()).toEqual(["Mati", "Tito", "Manu", "Juan", "Mecha"]);
    expect(screen.getByText("16 games · 43.8% win rate")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Most played" }));
    expect(rankedNames()).toEqual(["Mati", "Tito", "Manu", "Mecha", "Juan"]);

    await userEvent.click(screen.getByRole("tab", { name: "Achievements" }));
    expect(screen.getByText("Ranked by achievements earned, then completion percentage.")).toBeInTheDocument();
    expect(rankedNames()).toEqual(["Juan", "Mati", "Tito", "Manu", "Mecha"]);
    expect(screen.getByText("8 earned")).toBeInTheDocument();
    expect(screen.getByText("80% complete · 10 available")).toBeInTheDocument();
  });

  it("shows small efficiency samples but does not assign them a rank", () => {
    renderLeaderboard([leader("1", "Established", 3, 1), leader("2", "Rookie", 2, 2)], []);
    const rookie = screen.getByText("Rookie").closest("li")!;
    expect(within(rookie).getByText("—")).toBeInTheDocument();
    expect(within(rookie).getByText("Unranked")).toBeInTheDocument();
    expect(within(rookie).getByText("100%")).toBeInTheDocument();
  });

  it("links every player name to that player's POD-filtered profile", () => {
    renderLeaderboard();
    for (const link of screen.getAllByRole("link", { name: "Mati" })) {
      expect(link).toHaveAttribute("href", "/players/1?podId=pod-1");
    }
  });

  it("calculates a player's position in all four POD rankings", () => {
    expect(getPodPlayerRanks(leaders, achievementLeaders, "4")).toEqual({
      played: 3,
      wins: 3,
      effective: 4,
      achievements: 4,
      totals: { played: 5, wins: 5, effective: 5, achievements: 5 },
    });
  });
});
