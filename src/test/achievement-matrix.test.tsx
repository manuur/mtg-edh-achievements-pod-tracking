import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementMatrix } from "@/components/achievement-matrix";

const refresh = vi.fn();
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/client-api", () => ({
  apiRequest,
  ApiClientError: class ApiClientError extends Error {},
}));

const catalog = [
  { id: "10000000-0000-4000-8000-000000000001", name: "First blood", category: "Combat", description: "Deal first combat damage.", archivedAt: null },
  { id: "10000000-0000-4000-8000-000000000002", name: "Retired feat", category: "Legacy", description: "An archived challenge.", archivedAt: "2026-01-01T00:00:00.000Z" },
];
const members = [{ id: "20000000-0000-4000-8000-000000000001", displayName: "Mara" }];
const grants = [{
  playerId: members[0].id,
  achievementId: catalog[0].id,
  gameId: "40000000-0000-4000-8000-000000000001",
  earnedAt: "2026-08-20T20:00:00.000Z",
  gameArchivedAt: null,
  revokedAt: null,
  version: 1,
  grantedByName: "Nico",
  grantSource: "MANUAL" as const,
  automaticWinnerRole: null,
  notes: "Opening attack",
}];

describe("achievement matrix", () => {
  beforeEach(() => { refresh.mockClear(); apiRequest.mockReset(); });

  it("shows active achievements by default and can inspect archived catalog entries", async () => {
    render(<AchievementMatrix podId="30000000-0000-4000-8000-000000000001" timeZone="UTC" catalog={catalog} members={members} grants={grants} canEdit={false} />);
    expect(screen.getAllByText("First blood").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Combat" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Legacy" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Retired feat/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Filter catalog status"), "Archived");
    expect(screen.getAllByText(/Retired feat/).length).toBeGreaterThan(0);
  });

  it("keeps grant controls disabled for guests", () => {
    render(<AchievementMatrix podId="30000000-0000-4000-8000-000000000001" timeZone="UTC" catalog={catalog} members={members} grants={grants} canEdit={false} />);
    for (const button of screen.getAllByRole("button", { name: /Revoke First blood for Mara/ })) {
      expect(button).toBeDisabled();
    }
  });

  it("labels system-awarded role achievements without a player grantor", () => {
    const automatic = [{
      ...grants[0],
      grantedByName: null,
      grantSource: "AUTOMATIC" as const,
      automaticWinnerRole: "KINGSGUARD" as const,
      notes: "",
    }];
    render(<AchievementMatrix podId="30000000-0000-4000-8000-000000000001" timeZone="UTC" catalog={catalog} members={members} grants={automatic} canEdit={false} />);
    expect(screen.getByTitle(/Automatically awarded for winning as Kingsguard/)).toBeInTheDocument();
  });

  it("places members across the desktop header and achievements with descriptions down the side", () => {
    render(<AchievementMatrix podId="30000000-0000-4000-8000-000000000001" timeZone="UTC" catalog={catalog} members={members} grants={grants} canEdit={false} />);
    const matrices = screen.getAllByRole("table", { name: "POD achievements by member" });
    const matrix = matrices[matrices.length - 1];
    expect(within(matrix).getByRole("columnheader", { name: "Mara" })).toBeInTheDocument();
    const achievement = within(matrix).getByRole("rowheader", { name: /First blood/ });
    expect(within(achievement).getByText("Deal first combat damage.")).toBeInTheDocument();
    expect(within(matrix).getByRole("columnheader", { name: "Mara" })).toHaveClass("sticky", "top-0");
  });

  it("collapses mobile member lists and keeps their current member heading sticky", async () => {
    const secondMember = { id: "20000000-0000-4000-8000-000000000002", displayName: "Nico" };
    const { container } = render(<AchievementMatrix podId="30000000-0000-4000-8000-000000000001" timeZone="UTC" catalog={catalog} members={[...members, secondMember]} grants={grants} canEdit />);
    const maraHeader = container.querySelector<HTMLButtonElement>(`button[aria-controls="member-achievements-${members[0].id}"]`);
    const nicoHeader = container.querySelector<HTMLButtonElement>(`button[aria-controls="member-achievements-${secondMember.id}"]`);

    expect(maraHeader).toHaveAttribute("aria-expanded", "true");
    expect(nicoHeader).toHaveAttribute("aria-expanded", "false");
    expect(maraHeader).toHaveClass("sticky", "top-16");
    expect(document.getElementById(`member-achievements-${secondMember.id}`)).not.toBeVisible();

    await userEvent.click(nicoHeader!);
    expect(nicoHeader).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(`member-achievements-${secondMember.id}`)).toBeVisible();
  });

  it("defaults the note to the recipient's deck from the selected game", async () => {
    const game = {
      id: "40000000-0000-4000-8000-000000000001",
      playedAt: "2026-08-20T20:00:00.000Z",
      gameMode: "FREE_FOR_ALL" as const,
      gameModeName: "Free-for-all",
      resultKind: "WIN" as const,
      winners: [{ playerId: "20000000-0000-4000-8000-000000000002", playerName: "Nico", deckName: "Atraxa, Praetors' Voice" }],
      playerDeckName: "Alela, Artful Provocateur",
      participantCount: 4,
      notes: "Friday game",
    };
    const recipientWonGame = {
      ...game,
      id: "40000000-0000-4000-8000-000000000002",
      playedAt: "2026-08-21T20:00:00.000Z",
      winners: [{ playerId: members[0].id, playerName: "Mara", deckName: "Alela, Artful Provocateur" }],
      notes: "Saturday game",
    };
    const drawGame = {
      ...game,
      id: "40000000-0000-4000-8000-000000000003",
      playedAt: "2026-08-22T20:00:00.000Z",
      resultKind: "DRAW" as const,
      winners: [],
      notes: "Sunday game",
    };
    apiRequest.mockResolvedValueOnce({ items: [game, recipientWonGame, drawGame], nextCursor: null }).mockResolvedValueOnce({});
    render(<AchievementMatrix podId="30000000-0000-4000-8000-000000000001" timeZone="UTC" catalog={catalog} members={members} grants={[]} canEdit />);

    await userEvent.click(screen.getAllByRole("button", { name: /Grant First blood for Mara/ })[0]);
    const gameSelect = await screen.findByLabelText("Game where achievement was earned");
    await waitFor(() => expect(gameSelect).toHaveValue(game.id));
    expect(screen.getByRole("option", { name: /20\/08\/2026, 20:00 · Free-for-all · Winner: Nico \(Atraxa, Praetors' Voice\) · Mara: Alela, Artful Provocateur/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /21\/08\/2026, 20:00 · Free-for-all · Winner: Mara \(Alela, Artful Provocateur\) · 4 players · Saturday game/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /22\/08\/2026, 20:00 · Free-for-all · Draw · Mara: Alela, Artful Provocateur · 4 players · Sunday game/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Optional achievement note")).toHaveValue("Alela, Artful Provocateur");
    await userEvent.click(screen.getByRole("button", { name: "Grant achievement" }));

    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith(
      "/api/v1/pods/30000000-0000-4000-8000-000000000001/achievement-grants",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ playerId: members[0].id, achievementId: catalog[0].id, gameId: game.id, notes: "Alela, Artful Provocateur" }) }),
    ));
  });
});
