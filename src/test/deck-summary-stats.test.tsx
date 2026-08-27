import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeckSummaryStats } from "@/components/deck-summary-stats";

describe("owned deck summary stats", () => {
  it("shows all-time usage, record, win rate, and last-played date", () => {
    render(<DeckSummaryStats summary={{
      deck_id: "deck-1",
      games: 12,
      wins: 5,
      draws: 2,
      losses: 5,
      win_rate: 5 / 12,
      last_played: "2026-08-20T20:00:00.000Z",
      last_played_timezone: "America/Argentina/Buenos_Aires",
    }} />);

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("5W · 2D · 5L")).toBeInTheDocument();
    expect(screen.getByText("41.7%")).toBeInTheDocument();
    expect(screen.getByText("Last played Aug 20, 2026 · all PODs")).toBeInTheDocument();
  });

  it("shows a clear empty state for a deck that has never been used", () => {
    render(<DeckSummaryStats />);
    expect(screen.getByText("0W · 0D · 0L")).toBeInTheDocument();
    expect(screen.getByText("Never played · all PODs")).toBeInTheDocument();
  });
});
