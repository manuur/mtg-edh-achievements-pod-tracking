import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalLoadingProvider } from "@/components/global-loading";
import { apiRequest } from "@/lib/client-api";
import {
  beginGlobalLoading,
  clearGlobalLoading,
  getGlobalLoadingSnapshot,
} from "@/lib/loading";

afterEach(() => {
  clearGlobalLoading();
  vi.unstubAllGlobals();
});

describe("global blocking loader", () => {
  it("blocks and hides application content until every operation finishes", () => {
    render(<GlobalLoadingProvider><button>Application action</button></GlobalLoadingProvider>);
    let finishFirst: () => void = () => undefined;
    let finishSecond: () => void = () => undefined;

    act(() => {
      finishFirst = beginGlobalLoading("Loading games…");
      finishSecond = beginGlobalLoading("Saving changes…");
    });
    expect(screen.getByRole("status", { name: "Saving changes…" })).toBeInTheDocument();
    expect(screen.getByText("Application action").parentElement).toHaveAttribute("inert");

    act(() => finishSecond());
    expect(screen.getByRole("status", { name: "Loading games…" })).toBeInTheDocument();
    act(() => finishFirst());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("tracks the complete lifetime of API requests", async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; })));

    const request = apiRequest<{ ok: boolean }>("/api/v1/example");
    expect(getGlobalLoadingSnapshot()).toMatchObject({ active: true, message: "Loading…" });

    resolveRequest({ ok: true, status: 200, json: async () => ({ data: { ok: true } }) } as Response);
    await expect(request).resolves.toEqual({ ok: true });
    expect(getGlobalLoadingSnapshot().active).toBe(false);
  });
});
