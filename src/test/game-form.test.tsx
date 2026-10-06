import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameForm } from "@/components/forms/game-form";
import { DEFAULT_GAME_MODE_CATALOG } from "@/lib/game-modes";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(cleanup);

const members = Array.from({ length: 6 }, (_, index) => ({
  playerId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  displayName: `Player ${index + 1}`,
  status: "ACTIVE",
}));

const decks = members.map((member, index) => ({
  deck: {
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ownerPlayerId: member.playerId,
    name: `Deck ${index + 1}`,
    bracket: 3,
    powerLevel: 6,
  },
  ownerName: member.displayName,
}));

describe("new game participant defaults", () => {
  it("starts with Free-for-all and preselects every active POD player", async () => {
    render(<GameForm
      podId="30000000-0000-4000-8000-000000000001"
      podTimezone="UTC"
      gameModes={DEFAULT_GAME_MODE_CATALOG}
      members={members}
      initialDecks={decks}
      initialPlayedAt="2026-08-26T20:00"
    />);

    expect(screen.getByRole("button", { name: /Free-for-all/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Every player fights independently. Choose one winner, or record a draw.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Configure table/ }));
    const playerCheckboxes = screen.getAllByRole("checkbox", { name: /Player \d/ });
    expect(playerCheckboxes).toHaveLength(members.length);
    for (const checkbox of playerCheckboxes) expect(checkbox).toBeChecked();
  });

  it("blocks an exact-count mode until the table has the required players", async () => {
    render(<GameForm podId="30000000-0000-4000-8000-000000000001" podTimezone="UTC" gameModes={DEFAULT_GAME_MODE_CATALOG} members={members} initialDecks={decks} initialPlayedAt="2026-08-26T20:00" />);
    await userEvent.click(screen.getByRole("button", { name: /Pentagon/ }));
    await userEvent.click(screen.getByRole("button", { name: /Configure table/ }));
    await userEvent.click(screen.getByRole("button", { name: /Record result/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pentagon requires exactly 5 players.");
  });

  it("uses catalog-defined limits and exposes Draw for a custom mode", async () => {
    const customMode = {
      code: "TWO_HEADED_GIANT",
      name: "Two-Headed Giant",
      description: "Two teams share the victory.",
      minPlayers: 4,
      maxPlayers: 4,
      winningCriteria: "MULTIPLE_WINNERS" as const,
      systemKey: null,
      displayOrder: 60,
      archivedAt: null,
      version: 1,
      winAchievementRules: [],
      automationReady: true,
    };
    render(<GameForm podId="30000000-0000-4000-8000-000000000001" podTimezone="UTC" gameModes={[...DEFAULT_GAME_MODE_CATALOG, customMode]} members={members} initialDecks={decks} initialPlayedAt="2026-08-26T20:00" />);
    await userEvent.click(screen.getByRole("button", { name: /Two-Headed Giant/ }));
    await userEvent.click(screen.getByRole("button", { name: /Configure table/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Player 5/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Player 6/ }));
    await userEvent.click(screen.getByRole("button", { name: /Record result/ }));
    expect(screen.getByRole("button", { name: /Draw/ })).toBeInTheDocument();
    expect(screen.getByText("Two or more winners")).toBeInTheDocument();
  });
});
