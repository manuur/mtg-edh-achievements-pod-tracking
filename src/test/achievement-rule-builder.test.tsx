import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AchievementRuleBuilder } from "@/components/achievement-rule-builder";
import type { AchievementGameFactRule } from "@/lib/achievement-rules";
import { DEFAULT_GAME_MODE_CATALOG } from "@/lib/game-modes";

afterEach(cleanup);

function Harness({ initial = [] }: { initial?: AchievementGameFactRule[] }) {
  const [rules, setRules] = useState(initial);
  return <><AchievementRuleBuilder rules={rules} gameModes={DEFAULT_GAME_MODE_CATALOG} onChange={setRules} /><output aria-label="Rules JSON">{JSON.stringify(rules)}</output></>;
}

function currentRules() { return JSON.parse(screen.getByLabelText("Rules JSON").textContent!) as AchievementGameFactRule[]; }

describe("achievement rule builder", () => {
  it("starts disabled and builds typed AND conditions with a readable preview", async () => {
    render(<Harness />);
    expect(screen.getByRole("checkbox", { name: "Enabled" })).not.toBeChecked();
    expect(screen.queryByLabelText("Fact")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    await userEvent.selectOptions(screen.getByLabelText("Fact"), "COMMANDER_CMC");
    await userEvent.clear(screen.getByLabelText("Value"));
    await userEvent.type(screen.getByLabelText("Value"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Add AND condition" }));
    await userEvent.selectOptions(screen.getAllByLabelText("Fact")[1], "PLAYER_COUNT");
    await userEvent.clear(screen.getAllByLabelText("Value")[1]);
    await userEvent.type(screen.getAllByLabelText("Value")[1], "4");
    expect(currentRules()[0].conditions).toEqual([
      { fact: "COMMANDER_CMC", operator: "EQ", value: 3 },
      { fact: "PLAYER_COUNT", operator: "EQ", value: 4 },
    ]);
    expect(screen.getByText(/Commander CMC equals 3 and Player quantity equals 4/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Move condition up" })[1]);
    expect(currentRules()[0].conditions[0].fact).toBe("PLAYER_COUNT");
  });

  it("accepts decimal range typing, inclusive bounds, and valueless unknown comparisons", async () => {
    render(<Harness initial={[{ recipient: "WINNER", conditions: [{ fact: "DECK_POWER_LEVEL", operator: "EQ", value: 0 }] }]} />);
    await userEvent.selectOptions(screen.getByLabelText("Operator"), "BETWEEN");
    await userEvent.clear(screen.getByLabelText("Minimum"));
    await userEvent.type(screen.getByLabelText("Minimum"), "6.70");
    await userEvent.clear(screen.getByLabelText("Maximum"));
    await userEvent.type(screen.getByLabelText("Maximum"), "6.79");
    expect(currentRules()[0].conditions[0].value).toEqual([6.70, 6.79]);
    await userEvent.selectOptions(screen.getByLabelText("Operator"), "IS_UNKNOWN");
    expect(screen.queryByLabelText("Minimum")).not.toBeInTheDocument();
    expect(currentRules()[0].conditions[0]).toEqual({ fact: "DECK_POWER_LEVEL", operator: "IS_UNKNOWN" });
  });

  it("offers compatible color and boolean controls and canonical WUBRG values", async () => {
    render(<Harness initial={[{ recipient: "WINNER", conditions: [{ fact: "COMMANDER_CMC", operator: "EQ", value: 3 }] }]} />);
    await userEvent.selectOptions(screen.getByLabelText("Fact"), "COLOR_IDENTITY");
    expect(screen.queryByRole("option", { name: "is greater than" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /W White/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /G Green/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /R Red/ }));
    expect(currentRules()[0].conditions[0]).toEqual({ fact: "COLOR_IDENTITY", operator: "EXACTLY", value: ["R", "G"] });
    await userEvent.selectOptions(screen.getByLabelText("Fact"), "HAS_COMPANION");
    await userEvent.selectOptions(screen.getByLabelText("Value"), "false");
    expect(currentRules()[0].conditions[0]).toEqual({ fact: "HAS_COMPANION", operator: "EQ", value: false });
  });

  it("supports keyboard-operable OR reorder/removal and the ten-rule limit", async () => {
    render(<Harness initial={[
      { recipient: "WINNER", conditions: [{ fact: "COMMANDER_CMC", operator: "EQ", value: 3 }] },
      { recipient: "WINNER", conditions: [{ fact: "PLAYER_COUNT", operator: "EQ", value: 4 }] },
    ]} />);
    screen.getByRole("button", { name: "Move rule 2 up" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(currentRules()[0].conditions[0].fact).toBe("PLAYER_COUNT");
    await userEvent.click(screen.getByRole("button", { name: "Remove rule 2" }));
    for (let index = 1; index < 10; index++) await userEvent.click(screen.getByRole("button", { name: "Add OR rule" }));
    expect(screen.getByRole("button", { name: "Add OR rule" })).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(currentRules()).toEqual([]);
  });
});
