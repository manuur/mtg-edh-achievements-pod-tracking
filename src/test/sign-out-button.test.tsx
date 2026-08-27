import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replace, signOut } = vi.hoisted(() => ({
  replace: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({ authClient: { signOut } }));
vi.mock("@/lib/loading-router", () => ({ useLoadingRouter: () => ({ replace }) }));

import { SignOutButton } from "@/components/auth/sign-out-button";

describe("sign-out button", () => {
  beforeEach(() => {
    replace.mockReset();
    signOut.mockReset();
  });

  it("signs out through the auth client before navigating to login", async () => {
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("keeps the user in place and reports an auth error", async () => {
    signOut.mockResolvedValue({ data: null, error: { message: "Request failed" } });
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out failed. Please try again.");
    expect(replace).not.toHaveBeenCalled();
  });
});
