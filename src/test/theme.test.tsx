import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/theme-toggle";
import { applyThemePreference, resolveTheme } from "@/lib/theme-client";
import { THEME_STORAGE_KEY } from "@/lib/theme-types";

const refresh = vi.fn();
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/client-api", () => ({
  apiRequest,
  ApiClientError: class ApiClientError extends Error {},
}));

describe("theme preferences", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    refresh.mockReset();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preference");
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("resolves the system preference and applies explicit themes", () => {
    expect(resolveTheme("SYSTEM", true)).toBe("dark");
    expect(resolveTheme("SYSTEM", false)).toBe("light");
    applyThemePreference("LIGHT");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("LIGHT");
  });

  it("updates immediately and persists the selection through the profile API", async () => {
    apiRequest.mockResolvedValue({ themePreference: "LIGHT", version: 4 });
    render(<ThemeToggle initialPreference="SYSTEM" initialVersion={3} />);

    await userEvent.click(screen.getByRole("button", { name: "Light" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/profile/theme",
      {
        method: "PATCH",
        body: JSON.stringify({ themePreference: "LIGHT", version: 3 }),
      },
    ));
  });
});
