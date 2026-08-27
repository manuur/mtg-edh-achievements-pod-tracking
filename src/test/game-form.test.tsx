import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameForm } from "@/components/forms/game-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

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
  it("preselects every active POD player", () => {
    render(<GameForm
      podId="30000000-0000-4000-8000-000000000001"
      podTimezone="UTC"
      members={members}
      initialDecks={decks}
      initialPlayedAt="2026-08-26T20:00"
    />);

    const playerCheckboxes = screen.getAllByRole("checkbox");
    expect(playerCheckboxes).toHaveLength(members.length);
    for (const checkbox of playerCheckboxes) expect(checkbox).toBeChecked();
  });
});
