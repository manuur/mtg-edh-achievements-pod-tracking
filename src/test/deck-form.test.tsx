import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeckForm } from "@/components/forms/deck-form";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/client-api", () => ({
  apiRequest,
  ApiClientError: class ApiClientError extends Error {},
}));

describe("deck form", () => {
  beforeEach(() => apiRequest.mockReset());
  afterEach(cleanup);

  it("submits a blank power level as null", async () => {
    apiRequest.mockResolvedValue({
      id: "20000000-0000-4000-8000-000000000001",
      ownerPlayerId: "10000000-0000-4000-8000-000000000001",
      name: "Teysa",
      bracket: 3,
      powerLevel: null,
    });
    render(<DeckForm ownerPlayerId="10000000-0000-4000-8000-000000000001" />);

    await userEvent.type(screen.getByLabelText("Deck name"), "Teysa");
    expect(screen.getByLabelText("Power level · optional")).not.toBeRequired();
    await userEvent.click(screen.getByRole("button", { name: "Add deck" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/decks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ownerPlayerId: "10000000-0000-4000-8000-000000000001",
          name: "Teysa",
          bracket: 3,
          powerLevel: null,
          commanderCmc: null,
          colorIdentity: null,
          hasPartnerCommanders: false,
          hasCompanion: false,
          hasBackground: false,
          moxfieldUrl: "",
        }),
      }),
    ));
  });

  it("submits integer Commander CMC and distinguishes colorless from unknown", async () => {
    apiRequest.mockResolvedValue({
      id: "20000000-0000-4000-8000-000000000001",
      ownerPlayerId: "10000000-0000-4000-8000-000000000001",
      name: "Karn",
      bracket: 3,
      powerLevel: null,
      commanderCmc: 5,
      colorIdentity: [],
    });
    render(<DeckForm ownerPlayerId="10000000-0000-4000-8000-000000000001" />);
    await userEvent.type(screen.getByLabelText("Deck name"), "Karn");
    await userEvent.type(screen.getByLabelText(/^Commander CMC · optional/), "5");
    await userEvent.click(screen.getByLabelText("Colorless"));
    await userEvent.click(screen.getByRole("button", { name: "Add deck" }));
    await waitFor(() => expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toMatchObject({ commanderCmc: 5, colorIdentity: [] }));
  });

  it("submits manually declared Partner, Companion, and Background flags", async () => {
    apiRequest.mockResolvedValue({ id: "new-deck" });
    render(<DeckForm ownerPlayerId="10000000-0000-4000-8000-000000000001" />);
    await userEvent.type(screen.getByLabelText("Deck name"), "Partners");
    for (const label of ["Partner commanders", "Companion", "Background"]) {
      expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked();
      await userEvent.click(screen.getByRole("checkbox", { name: label }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Add deck" }));
    await waitFor(() => expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toMatchObject({
      hasPartnerCommanders: true, hasCompanion: true, hasBackground: true,
    }));
  });
});
