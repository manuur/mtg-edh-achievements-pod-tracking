import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementCatalogManager, type AchievementCategory, type CatalogAchievement } from "@/components/achievement-catalog-manager";
import { DEFAULT_GAME_MODE_CATALOG } from "@/lib/game-modes";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/lib/loading-router", () => ({
  useLoadingRouter: () => ({ refresh: navigation.refresh }),
}));

const categories: AchievementCategory[] = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Combat", displayOrder: 10, version: 1 },
  { id: "10000000-0000-4000-8000-000000000002", name: "Politics", displayOrder: 20, version: 1 },
];

const achievements: CatalogAchievement[] = [
  { id: "20000000-0000-4000-8000-000000000001", code: "first-hit", name: "First hit", description: "Deal first damage.", category: "Combat", displayOrder: 10, archivedAt: null, version: 1 },
  { id: "20000000-0000-4000-8000-000000000002", code: "table-save", name: "Table save", description: "Save another player.", category: "Politics", displayOrder: 10, archivedAt: null, version: 1 },
];

describe("achievement catalog manager", () => {
  beforeEach(() => {
    navigation.refresh.mockReset();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("groups achievements under ordered categories and exposes sortable handles", () => {
    render(<AchievementCatalogManager achievements={achievements} categories={categories} />);

    const combatHeading = screen.getByRole("heading", { name: "Combat" });
    const combatCard = combatHeading.closest<HTMLElement>("div[class*='rounded-2xl']")!;
    expect(within(combatCard).getByText("First hit")).toBeInTheDocument();
    expect(within(combatCard).queryByText("Table save")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Combat category" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move First hit" })).toBeInTheDocument();
  });

  it("uses category records in a dropdown and reveals the new-category field on demand", async () => {
    render(<AchievementCatalogManager achievements={achievements} categories={categories} />);
    const category = screen.getByLabelText("Category");

    expect(category).toHaveValue(categories[0].id);
    expect(screen.queryByLabelText("New category name")).not.toBeInTheDocument();
    await userEvent.selectOptions(category, "__new_category__");
    expect(screen.getByLabelText("New category name")).toBeRequired();
  });

  it("scrolls to and focuses the editor after choosing an achievement", async () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0));
    render(<AchievementCatalogManager achievements={achievements} categories={categories} />);

    await userEvent.click(screen.getByRole("button", { name: "Edit First hit" }));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" }));
    expect(screen.getByLabelText("Name")).toHaveValue("First hit");
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("creates a selected new category before creating its achievement", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/achievement-categories")) {
        return new Response(JSON.stringify({ data: { id: "10000000-0000-4000-8000-000000000003", name: "Oddities", displayOrder: 30, version: 1 } }), { status: 201 });
      }
      return new Response(JSON.stringify({ data: {} }), { status: 201 });
    });
    render(<AchievementCatalogManager achievements={achievements} categories={categories} />);

    await userEvent.type(screen.getByLabelText("Name"), "Strange ending");
    await userEvent.type(screen.getByLabelText("Code"), "strange-ending");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "__new_category__");
    await userEvent.type(screen.getByLabelText("New category name"), "Oddities");
    await userEvent.click(screen.getByRole("button", { name: "Add achievement" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/achievement-categories");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ name: "Oddities" });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/admin/achievements");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({ category: "Oddities", displayOrder: 10 });
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it("submits configurable winner rules from the achievement editor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 201 }));
    render(<AchievementCatalogManager achievements={achievements} categories={categories} gameModes={DEFAULT_GAME_MODE_CATALOG} />);
    await userEvent.type(screen.getByLabelText("Name"), "CMC three");
    await userEvent.type(screen.getByLabelText("Code"), "cmc-three");
    await userEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    await userEvent.selectOptions(screen.getByLabelText("Fact"), "COMMANDER_CMC");
    await userEvent.clear(screen.getByLabelText("Value"));
    await userEvent.type(screen.getByLabelText("Value"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Add achievement" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      gameFactRules: [{ recipient: "WINNER", conditions: [{ fact: "COMMANDER_CMC", operator: "EQ", value: 3 }] }],
    });
  });

  it("identifies and confirms occupied mapping replacements and uses the mode version", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const mode = { ...DEFAULT_GAME_MODE_CATALOG[0], winAchievementRules: [{ winnerRole: null, achievementId: achievements[0].id }] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { ...mode, version: 2, winAchievementRules: [{ winnerRole: null, achievementId: achievements[1].id }] } }), { status: 200 }));
    render(<AchievementCatalogManager achievements={achievements} categories={categories} gameModes={[mode]} />);
    expect(screen.getByText(/Automatic · 1/)).toBeInTheDocument();
    await userEvent.click(screen.getByText("Free-for-all"));
    await userEvent.selectOptions(screen.getByLabelText("Win achievement · optional"), achievements[1].id);
    await userEvent.click(screen.getByRole("button", { name: "Save Free-for-all mappings" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("First hit → Table save"));
    expect(fetchMock).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Save Free-for-all mappings" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/game-modes/FREE_FOR_ALL");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      version: 1, winAchievementRules: [{ winnerRole: null, achievementId: achievements[1].id }],
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Free-for-all mappings" })).not.toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Save Free-for-all mappings" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).version).toBe(2);
  });

  it("requires all role slots to be saved together and reports optimistic conflicts", async () => {
    const mode = DEFAULT_GAME_MODE_CATALOG.find((candidate) => candidate.code === "ARCHENEMY")!;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: { code: "CONFLICT", message: "The game mode changed before it could be saved." } }), { status: 409 }));
    render(<AchievementCatalogManager achievements={achievements} categories={categories} gameModes={[mode]} />);
    await userEvent.click(screen.getByText("Archenemy"));
    await userEvent.selectOptions(screen.getByLabelText("Archenemy · required"), achievements[0].id);
    await userEvent.click(screen.getByRole("button", { name: "Save Archenemy mappings" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Choose an achievement for every required Archenemy role.");
    await userEvent.selectOptions(screen.getByLabelText("Hero · required"), achievements[1].id);
    await userEvent.click(screen.getByRole("button", { name: "Save Archenemy mappings" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The game mode changed before it could be saved."));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      version: 1,
      winAchievementRules: [
        { winnerRole: "ARCHENEMY", achievementId: achievements[0].id },
        { winnerRole: "HERO", achievementId: achievements[1].id },
      ],
    });
  });
});
