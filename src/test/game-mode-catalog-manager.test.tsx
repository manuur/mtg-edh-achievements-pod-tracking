import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameModeCatalogManager } from "@/components/game-mode-catalog-manager";
import { DEFAULT_GAME_MODE_CATALOG, type GameModeCatalogItem } from "@/lib/game-modes";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/lib/loading-router", () => ({ useLoadingRouter: () => ({ refresh: navigation.refresh }) }));

const achievements = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Archenemy winner", category: "Game modes", archivedAt: null },
  { id: "10000000-0000-4000-8000-000000000002", name: "Hero winner", category: "Game modes", archivedAt: null },
];

describe("game-mode catalog manager", () => {
  beforeEach(() => {
    navigation.refresh.mockReset();
    vi.restoreAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows catalog rules and locks structural fields on built-in modes", async () => {
    render(<GameModeCatalogManager gameModes={DEFAULT_GAME_MODE_CATALOG} achievements={achievements} />);
    expect(screen.getAllByText("Draw allowed")).toHaveLength(DEFAULT_GAME_MODE_CATALOG.length);
    await userEvent.click(screen.getByRole("button", { name: "Edit Pentagon" }));
    expect(screen.getByLabelText("Minimum players")).toBeDisabled();
    expect(screen.getByLabelText("Maximum players")).toBeDisabled();
    expect(screen.getByLabelText("Winning criteria")).toBeDisabled();
  });

  it("creates a custom mode with numeric limits and winner rules", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 201 }));
    render(<GameModeCatalogManager gameModes={DEFAULT_GAME_MODE_CATALOG} achievements={achievements} />);
    await userEvent.type(screen.getByLabelText("Name"), "Two-Headed Giant");
    await userEvent.type(screen.getByLabelText("Description"), "Two teams share victory.");
    await userEvent.clear(screen.getByLabelText("Minimum players"));
    await userEvent.type(screen.getByLabelText("Minimum players"), "4");
    await userEvent.clear(screen.getByLabelText("Maximum players"));
    await userEvent.type(screen.getByLabelText("Maximum players"), "6");
    await userEvent.selectOptions(screen.getByLabelText("Winning criteria"), "MULTIPLE_WINNERS");
    await userEvent.click(screen.getByRole("button", { name: "Add game mode" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      name: "Two-Headed Giant",
      description: "Two teams share victory.",
      minPlayers: 4,
      maxPlayers: 6,
      winningCriteria: "MULTIPLE_WINNERS",
      winAchievementRules: [],
    });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("keeps archived modes visible for historical administration", () => {
    const archived: GameModeCatalogItem = { ...DEFAULT_GAME_MODE_CATALOG[0], archivedAt: "2026-08-31T00:00:00.000Z" };
    render(<GameModeCatalogManager gameModes={[archived]} achievements={achievements} />);
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore Free-for-all" })).toBeInTheDocument();
  });

  it("requires a distinct achievement for every Archenemy role", async () => {
    const mode = {
      ...DEFAULT_GAME_MODE_CATALOG.find((item) => item.code === "ARCHENEMY")!,
      winAchievementRules: [
        { winnerRole: "ARCHENEMY" as const, achievementId: achievements[0].id },
        { winnerRole: "HERO" as const, achievementId: achievements[1].id },
      ],
      automationReady: true,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    render(<GameModeCatalogManager gameModes={[mode]} achievements={achievements} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Archenemy" }));
    expect(screen.getByLabelText("Archenemy win")).toBeRequired();
    expect(screen.getByLabelText("Hero win")).toBeRequired();
    await userEvent.click(screen.getByRole("button", { name: "Save game mode" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).winAchievementRules).toEqual(mode.winAchievementRules);
  });
});
