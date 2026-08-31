import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementCatalogManager, type AchievementCategory, type CatalogAchievement } from "@/components/achievement-catalog-manager";

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
});
