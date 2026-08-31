import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameAchievementBadges, GameAchievementBreakdown } from "@/components/game-achievement-badges";
import type { GameAchievementBadge } from "@/server/games";

const achievements: GameAchievementBadge[] = [
  {
    achievementId: "achievement-1",
    achievementName: "First blood",
    achievementDescription: "Deal the first combat damage.",
    category: "Combat",
    playerId: "player-1",
    playerName: "Mara",
    archivedAt: null,
    grantSource: "MANUAL",
    winnerRole: null,
  },
  {
    achievementId: "achievement-2",
    achievementName: "Table savior",
    achievementDescription: "Save the table from defeat.",
    category: "Heroics",
    playerId: "player-1",
    playerName: "Mara",
    archivedAt: null,
    grantSource: "AUTOMATIC",
    winnerRole: "HERO",
  },
  {
    achievementId: "achievement-3",
    achievementName: "Against all odds",
    achievementDescription: "Win from a difficult position.",
    category: "Victory",
    playerId: "player-2",
    playerName: "Nico",
    archivedAt: new Date("2026-08-01T00:00:00.000Z"),
    grantSource: "MANUAL",
    winnerRole: null,
  },
];

describe("game achievement badges", () => {
  it("renders one compact badge for every achievement with its recipient", () => {
    render(<GameAchievementBadges achievements={achievements} />);

    const list = screen.getByRole("list", { name: "Achievements earned in this game" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("First blood")).toBeInTheDocument();
    expect(within(list).getAllByText("· Mara")).toHaveLength(2);
    expect(within(list).getByText("· Nico")).toBeInTheDocument();
  });

  it("groups every earned badge under its player on game detail", () => {
    render(<GameAchievementBreakdown
      achievements={achievements}
      players={[
        { playerId: "player-1", playerName: "Mara" },
        { playerId: "player-2", playerName: "Nico" },
        { playerId: "player-3", playerName: "Tito" },
      ]}
    />);

    expect(screen.getByRole("heading", { name: "Badges from this game" })).toBeInTheDocument();
    const mara = screen.getByRole("region", { name: "Mara" });
    const nico = screen.getByRole("region", { name: "Nico" });
    expect(within(mara).getByText("2 badges")).toBeInTheDocument();
    expect(within(mara).getByText("First blood")).toBeInTheDocument();
    expect(within(mara).getByText("Table savior")).toBeInTheDocument();
    expect(within(nico).getByText("1 badge")).toBeInTheDocument();
    expect(within(nico).getByText("Against all odds")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tito" })).not.toBeInTheDocument();
  });

  it("does not add an empty achievement section to games without earned badges", () => {
    const { container } = render(<GameAchievementBreakdown achievements={[]} players={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
