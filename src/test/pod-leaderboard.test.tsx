import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PodLeaderboard, type PodLeaderboardEntry } from "@/components/pod-leaderboard";

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

function rankedNames() {
  return screen.getAllByRole("listitem").map((row) => row.querySelector("p")?.textContent);
}

describe("POD leaderboard", () => {
  it("makes the ranking formula explicit and switches between efficiency, wins, and appearances", async () => {
    render(<PodLeaderboard leaders={leaders} />);

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
  });

  it("shows small efficiency samples but does not assign them a rank", () => {
    render(<PodLeaderboard leaders={[leader("1", "Established", 3, 1), leader("2", "Rookie", 2, 2)]} />);
    const rookie = screen.getByText("Rookie").closest("li")!;
    expect(within(rookie).getByText("—")).toBeInTheDocument();
    expect(within(rookie).getByText("Unranked")).toBeInTheDocument();
    expect(within(rookie).getByText("100%")).toBeInTheDocument();
  });
});
