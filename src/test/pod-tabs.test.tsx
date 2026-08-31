import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PodTabs } from "@/components/pod-tabs";

const navigation = vi.hoisted(() => ({
  pathname: "/pods/pod-1/games/new",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@/lib/loading-router", () => ({
  useLoadingRouter: () => ({ push: navigation.push }),
}));

describe("POD navigation", () => {
  afterEach(cleanup);

  beforeEach(() => {
    navigation.pathname = "/pods/pod-1/games/new";
    navigation.push.mockReset();
  });

  it("uses a compact section selector on mobile and identifies nested active routes", async () => {
    render(<PodTabs podId="pod-1" isAdmin />);

    const selector = screen.getByRole("combobox", { name: "POD section" });
    expect(selector).toHaveValue("/pods/pod-1/games");
    expect(screen.getByRole("link", { name: "Games" })).toHaveAttribute("aria-current", "page");

    await userEvent.selectOptions(selector, "/pods/pod-1/metrics");
    expect(navigation.push).toHaveBeenCalledWith("/pods/pod-1/metrics");
  });

  it("only exposes Settings to POD administrators", () => {
    render(<PodTabs podId="pod-1" isAdmin={false} />);

    expect(screen.queryByRole("option", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });
});
