import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AchievementMatrix } from "@/components/achievement-matrix";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const catalog = [
  { id: "10000000-0000-4000-8000-000000000001", name: "First blood", category: "Combat", description: "Deal first combat damage.", archivedAt: null },
  { id: "10000000-0000-4000-8000-000000000002", name: "Retired feat", category: "Legacy", description: "An archived challenge.", archivedAt: "2026-01-01T00:00:00.000Z" },
];
const members = [{ id: "20000000-0000-4000-8000-000000000001", displayName: "Mara" }];
const grants = [{
  playerId: members[0].id,
  achievementId: catalog[0].id,
  revokedAt: null,
  version: 1,
  grantedAt: "2026-08-22T20:00:00.000Z",
  grantedByName: "Nico",
  notes: "Opening attack",
}];

describe("achievement matrix", () => {
  beforeEach(() => refresh.mockClear());

  it("shows active achievements by default and can inspect archived catalog entries", async () => {
    render(<AchievementMatrix podId="30000000-0000-4000-8000-000000000001" catalog={catalog} members={members} grants={grants} canEdit={false} />);
    expect(screen.getAllByText("First blood").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Retired feat/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Filter catalog status"), "Archived");
    expect(screen.getAllByText(/Retired feat/).length).toBeGreaterThan(0);
  });

  it("keeps grant controls disabled for guests", () => {
    render(<AchievementMatrix podId="30000000-0000-4000-8000-000000000001" catalog={catalog} members={members} grants={grants} canEdit={false} />);
    for (const button of screen.getAllByRole("button", { name: /Revoke First blood for Mara/ })) {
      expect(button).toBeDisabled();
    }
  });
});
