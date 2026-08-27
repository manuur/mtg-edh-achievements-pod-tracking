import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, getAuthUser, redirect } = vi.hoisted(() => ({
  connection: vi.fn(),
  getAuthUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getAuthUser }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/server", () => ({ connection }));

import HomePage from "@/app/page";

describe("home page authentication routing", () => {
  beforeEach(() => {
    connection.mockReset();
    connection.mockResolvedValue(undefined);
    getAuthUser.mockReset();
    redirect.mockReset();
  });

  it("redirects an authenticated visitor to the dashboard", async () => {
    getAuthUser.mockResolvedValue({ id: "user-1", email: "mara@example.com", name: "Mara" });
    redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });

    await expect(HomePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("keeps the public landing page for a signed-out visitor", async () => {
    getAuthUser.mockResolvedValue(null);
    render(await HomePage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Remember more than who won." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
