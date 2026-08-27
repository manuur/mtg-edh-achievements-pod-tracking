import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/server", () => ({ getNeonAuth: vi.fn() }));
vi.mock("@/lib/env", () => ({ isDevAuthEnabled: vi.fn(() => false) }));

import { config } from "@/proxy";

describe("authentication proxy matcher", () => {
  it.each([
    "/dashboard",
    "/pods/new",
    "/pods/00000000-0000-4000-8000-000000000001/games",
    "/decks",
    "/players/00000000-0000-4000-8000-000000000001",
    "/admin/achievements",
    "/admin/users",
    "/settings/profile",
  ])("runs for authenticated application route %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
  });

  it.each([
    "/",
    "/login",
    "/api/auth/get-session",
    "/api/v1/pods",
    "/_next/static/chunks/app.js",
    "/favicon.ico",
  ])("does not run for public, API, or static route %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });
});
