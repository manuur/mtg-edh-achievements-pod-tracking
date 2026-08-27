import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppNav } from "@/components/app-nav";
import type { UserContext } from "@/lib/auth/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));

const context: UserContext = {
  user: { id: "auth-user", email: "mara@example.com", name: "Mara" },
  player: { id: "20000000-0000-4000-8000-000000000001", displayName: "Mara", themePreference: "SYSTEM", version: 1 },
  isSuperuser: false,
  accessToken: null,
};

describe("application navigation", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("shows joined PODs in a collapsible desktop menu", async () => {
    const { container } = render(<AppNav context={context} pods={[
      { id: "30000000-0000-4000-8000-000000000001", name: "Friday Night", role: "EDITOR" },
      { id: "30000000-0000-4000-8000-000000000002", name: "Sunday Pod", role: "GUEST" },
    ]} />);
    const summary = container.querySelector("summary");
    const menu = summary?.closest("details");

    expect(menu).not.toHaveAttribute("open");
    expect(summary).toHaveTextContent("PODs2");

    await userEvent.click(summary!);
    expect(menu).toHaveAttribute("open");
    expect(container.querySelector('a[href="/pods/30000000-0000-4000-8000-000000000001"]')).toHaveTextContent("Friday Night");
    expect(container.querySelector('a[href="/pods/30000000-0000-4000-8000-000000000002"]')).toHaveTextContent("Sunday Pod");
    expect(container.querySelector('a[href="/pods/new"]')).toHaveTextContent("Create POD");
  });
});
