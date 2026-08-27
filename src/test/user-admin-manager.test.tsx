import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserAdminManager } from "@/components/user-admin-manager";
import type { AdminUserSummary } from "@/server/admin";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const users = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    displayName: "Owner",
    email: "owner@example.com",
    claimed: true,
    archivedAt: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    version: 1,
    podCount: 1,
    deckCount: 1,
    gameCount: 2,
    achievementCount: 3,
    isSuperadmin: true,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    displayName: "Mara",
    email: null,
    claimed: false,
    archivedAt: null,
    createdAt: "2026-08-21T00:00:00.000Z",
    version: 2,
    podCount: 2,
    deckCount: 4,
    gameCount: 8,
    achievementCount: 5,
    isSuperadmin: false,
  },
] satisfies AdminUserSummary[];

describe("Superadmin user manager", () => {
  it("protects the singleton and requires exact typed confirmation", async () => {
    const user = userEvent.setup();
    render(<UserAdminManager users={users} />);

    expect(screen.getByText("Protected singleton")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Hard delete" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Hard delete" }));
    const confirmation = screen.getByLabelText(/Type DELETE Mara to confirm/);
    const deleteButton = screen.getByRole("button", { name: "Permanently delete player" });
    expect(deleteButton).toBeDisabled();
    await user.type(confirmation, "DELETE Mara");
    expect(deleteButton).toBeEnabled();
  });
});
