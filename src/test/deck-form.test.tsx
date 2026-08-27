import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeckForm } from "@/components/forms/deck-form";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/client-api", () => ({
  apiRequest,
  ApiClientError: class ApiClientError extends Error {},
}));

describe("deck form", () => {
  beforeEach(() => apiRequest.mockReset());

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
          moxfieldUrl: "",
        }),
      }),
    ));
  });
});
