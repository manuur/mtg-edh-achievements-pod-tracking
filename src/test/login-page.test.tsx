import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthUser, isDevAuthEnabled, redirect } = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  isDevAuthEnabled: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getAuthUser }));
vi.mock("@/lib/env", () => ({ isDevAuthEnabled }));
vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

import LoginPage from "@/app/login/page";

describe("login page authentication routing", () => {
  beforeEach(() => {
    getAuthUser.mockReset();
    isDevAuthEnabled.mockReset();
    redirect.mockReset();
    isDevAuthEnabled.mockReturnValue(false);
  });

  it("redirects an authenticated visitor to the dashboard", async () => {
    getAuthUser.mockResolvedValue({ id: "user-1", email: "mara@example.com", name: "Mara" });
    redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });

    await expect(LoginPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the sign-in screen to a signed-out visitor", async () => {
    getAuthUser.mockResolvedValue(null);
    render(await LoginPage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Take your seat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
});
