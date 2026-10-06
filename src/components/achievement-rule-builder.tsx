"use client";

import { ArrowDown, ArrowUp, Plus, Trash2, WandSparkles } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Field, inputClass } from "@/components/ui";
import {
  GAME_FACT_DEFINITIONS,
  GAME_FACT_KEYS,
  OPERATOR_LABELS,
  conditionNeedsValue,
  describeCondition,
  operatorsForFact,
  type AchievementConditionValue,
  type AchievementGameFactCondition,
  type AchievementGameFactRule,
  type GameFactKey,
  type GameFactOperator,
} from "@/lib/achievement-rules";
import { MTG_COLORS, MTG_COLOR_NAMES, type MtgColor } from "@/lib/deck-metadata";
import { GAME_PARTICIPANT_ROLES, MONARCHY_BANDIT_RULES } from "@/lib/game-modes";

export type RuleBuilderGameMode = { code: string; name: string; archivedAt: Date | string | null };

const DEFAULT_CONDITION: AchievementGameFactCondition = { fact: "GAME_MODE", operator: "EQ", value: "FREE_FOR_ALL" };

export function AchievementRuleBuilder({ rules, gameModes, onChange, disabled = false }: {
  rules: AchievementGameFactRule[];
  gameModes: RuleBuilderGameMode[];
  onChange: (rules: AchievementGameFactRule[]) => void;
  disabled?: boolean;
}) {
  const modeNames = Object.fromEntries(gameModes.map((mode) => [mode.code, mode.name]));
  const enabled = rules.length > 0;

  function setEnabled(next: boolean) {
    onChange(next ? [{ recipient: "WINNER", conditions: [defaultCondition(gameModes)] }] : []);
  }

  function updateRule(index: number, rule: AchievementGameFactRule) {
    onChange(rules.map((candidate, candidateIndex) => candidateIndex === index ? rule : candidate));
  }

  function moveRule(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const next = [...rules];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return <section className="grid min-w-0 gap-4 rounded-2xl border border-violet-300/15 bg-violet-300/5 p-4 [&_label]:min-w-0 [&_select]:min-w-0" aria-labelledby="automatic-granting-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><WandSparkles className="size-4 text-violet-200" /><h3 id="automatic-granting-heading" className="font-semibold text-stone-100">Automatic granting</h3>{enabled && <Badge>{rules.length} OR {rules.length === 1 ? "rule" : "rules"}</Badge>}</div>
        <p className="mt-1 text-xs leading-5 text-stone-500">Every winner is checked independently. All conditions in a card must match; any card can award the achievement.</p>
      </div>
      <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-stone-300">
        <input type="checkbox" checked={enabled} disabled={disabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-violet-300" />
        Enabled
      </label>
    </div>

    {enabled && <div className="grid gap-4">
      {rules.map((rule, ruleIndex) => <div key={ruleIndex} role="group" aria-label={`Automatic rule ${ruleIndex + 1}`} className="grid min-w-0 gap-3 rounded-xl border border-white/8 bg-black/15 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-violet-100">Award winner when all conditions match</p>
          <div className="flex gap-1">
            <IconButton label={`Move rule ${ruleIndex + 1} up`} disabled={disabled || ruleIndex === 0} onClick={() => moveRule(ruleIndex, -1)}><ArrowUp className="size-4" /></IconButton>
            <IconButton label={`Move rule ${ruleIndex + 1} down`} disabled={disabled || ruleIndex === rules.length - 1} onClick={() => moveRule(ruleIndex, 1)}><ArrowDown className="size-4" /></IconButton>
            <IconButton label={`Remove rule ${ruleIndex + 1}`} disabled={disabled} onClick={() => onChange(rules.filter((_, index) => index !== ruleIndex))}><Trash2 className="size-4" /></IconButton>
          </div>
        </div>
        <div className="grid gap-3">
          {rule.conditions.map((condition, conditionIndex) => <ConditionEditor
            key={conditionIndex}
            condition={condition}
            gameModes={gameModes}
            disabled={disabled}
            onChange={(next) => updateRule(ruleIndex, { ...rule, conditions: rule.conditions.map((candidate, index) => index === conditionIndex ? next : candidate) })}
            onRemove={() => updateRule(ruleIndex, { ...rule, conditions: rule.conditions.filter((_, index) => index !== conditionIndex) })}
            onMove={(direction) => {
              const target = conditionIndex + direction;
              if (target < 0 || target >= rule.conditions.length) return;
              const conditions = [...rule.conditions];
              [conditions[conditionIndex], conditions[target]] = [conditions[target], conditions[conditionIndex]];
              updateRule(ruleIndex, { ...rule, conditions });
            }}
            canRemove={rule.conditions.length > 1}
            canMoveUp={conditionIndex > 0}
            canMoveDown={conditionIndex < rule.conditions.length - 1}
          />)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="secondary" disabled={disabled || rule.conditions.length >= 10} onClick={() => updateRule(ruleIndex, { ...rule, conditions: [...rule.conditions, defaultCondition(gameModes)] })}><Plus className="size-4" />Add AND condition</Button>
          <p className="min-w-0 text-xs leading-5 text-stone-500"><span className="text-stone-400">Preview:</span> {rule.conditions.map((condition) => describeCondition(condition, modeNames)).join(" and ")}</p>
        </div>
      </div>)}
      <Button type="button" variant="secondary" disabled={disabled || rules.length >= 10} onClick={() => onChange([...rules, { recipient: "WINNER", conditions: [defaultCondition(gameModes)] }])}><Plus className="size-4" />Add OR rule</Button>
    </div>}
  </section>;
}

function ConditionEditor({ condition, gameModes, disabled, onChange, onRemove, onMove, canRemove, canMoveUp, canMoveDown }: {
  condition: AchievementGameFactCondition;
  gameModes: RuleBuilderGameMode[];
  disabled: boolean;
  onChange: (condition: AchievementGameFactCondition) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const definition = GAME_FACT_DEFINITIONS[condition.fact];
  const operators = operatorsForFact(condition.fact);

  function changeFact(fact: GameFactKey) {
    const operator = operatorsForFact(fact)[0];
    onChange({ fact, operator, ...(conditionNeedsValue(operator) && { value: defaultValue(fact, operator, gameModes) }) });
  }

  function changeOperator(operator: GameFactOperator) {
    onChange({ fact: condition.fact, operator, ...(conditionNeedsValue(operator) && { value: defaultValue(condition.fact, operator, gameModes, condition.value) }) });
  }

  return <div role="group" aria-label={`${definition.shortLabel} condition`} className="grid min-w-0 gap-2 rounded-xl border border-white/7 bg-white/3 p-3">
    <div className="grid min-w-0 gap-2">
      <Field label="Fact"><select value={condition.fact} disabled={disabled} onChange={(event) => changeFact(event.target.value as GameFactKey)} className={inputClass}>{GAME_FACT_KEYS.map((fact) => <option key={fact} value={fact}>{GAME_FACT_DEFINITIONS[fact].label}</option>)}</select></Field>
      <Field label="Operator"><select value={condition.operator} disabled={disabled} onChange={(event) => changeOperator(event.target.value as GameFactOperator)} className={inputClass}>{operators.map((operator) => <option key={operator} value={operator}>{OPERATOR_LABELS[operator]}</option>)}</select></Field>
      <div className="flex items-end gap-1">
        <IconButton label="Move condition up" disabled={disabled || !canMoveUp} onClick={() => onMove(-1)}><ArrowUp className="size-4" /></IconButton>
        <IconButton label="Move condition down" disabled={disabled || !canMoveDown} onClick={() => onMove(1)}><ArrowDown className="size-4" /></IconButton>
        <IconButton label="Remove condition" disabled={disabled || !canRemove} onClick={onRemove}><Trash2 className="size-4" /></IconButton>
      </div>
    </div>
    {conditionNeedsValue(condition.operator) && <ConditionValue condition={condition} gameModes={gameModes} onChange={(value) => onChange({ ...condition, value })} disabled={disabled} />}
    {definition.nullable && <p className="text-[11px] text-stone-600">Missing values only match “is unknown”; other comparisons return false.</p>}
  </div>;
}

function ConditionValue({ condition, gameModes, onChange, disabled }: {
  condition: AchievementGameFactCondition;
  gameModes: RuleBuilderGameMode[];
  onChange: (value: AchievementConditionValue) => void;
  disabled: boolean;
}) {
  const definition = GAME_FACT_DEFINITIONS[condition.fact];
  if (definition.kind === "NUMBER") {
    const step = definition.integer ? 1 : 0.01;
    if (condition.operator === "BETWEEN") {
      const value = Array.isArray(condition.value) ? condition.value as [number, number] : [definition.min ?? 0, definition.min ?? 0];
      return <div className="grid min-w-0 grid-cols-2 gap-2"><Field label="Minimum"><NumericRuleInput value={value[0]} min={definition.min} max={definition.max} step={step} disabled={disabled} onChange={(next) => onChange([next, value[1]])} /></Field><Field label="Maximum"><NumericRuleInput value={value[1]} min={definition.min} max={definition.max} step={step} disabled={disabled} onChange={(next) => onChange([value[0], next])} /></Field></div>;
    }
    return <Field label="Value"><NumericRuleInput value={typeof condition.value === "number" ? condition.value : definition.min ?? 0} min={definition.min} max={definition.max} step={step} disabled={disabled} onChange={onChange} /></Field>;
  }
  if (definition.kind === "GAME_MODE") return <Field label="Value"><select value={String(condition.value ?? gameModes[0]?.code ?? "FREE_FOR_ALL")} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>{gameModes.map((mode) => <option key={mode.code} value={mode.code}>{mode.name}{mode.archivedAt ? " (archived)" : ""}</option>)}</select></Field>;
  if (definition.kind === "MONARCHY_RULE") return <Field label="Value"><select value={String(condition.value ?? MONARCHY_BANDIT_RULES[0])} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>{MONARCHY_BANDIT_RULES.map((rule) => <option key={rule} value={rule}>{rule === "ALL_BANDITS" ? "All Bandits" : "Surviving Bandits"}</option>)}</select></Field>;
  if (definition.kind === "ROLE") return <Field label="Value"><select value={String(condition.value ?? GAME_PARTICIPANT_ROLES[0])} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={inputClass}>{GAME_PARTICIPANT_ROLES.map((role) => <option key={role} value={role}>{title(role)}</option>)}</select></Field>;
  if (definition.kind === "BOOLEAN") return <Field label="Value"><select value={String(condition.value ?? true)} disabled={disabled} onChange={(event) => onChange(event.target.value === "true")} className={inputClass}><option value="true">Yes</option><option value="false">No</option></select></Field>;
  const colors: MtgColor[] = Array.isArray(condition.value) ? condition.value as MtgColor[] : ["W"];
  return <fieldset><legend className="mb-2 text-sm font-medium text-stone-300">Colors</legend><div className="flex flex-wrap gap-2">{MTG_COLORS.map((color) => <label key={color} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/8 px-3 text-sm"><input type="checkbox" aria-label={`${color} ${MTG_COLOR_NAMES[color]}`} checked={colors.includes(color)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? MTG_COLORS.filter((candidate) => [...colors, color].includes(candidate)) as MtgColor[] : colors.filter((candidate) => candidate !== color))} className="accent-amber-300" /><strong>{color}</strong><span className="text-stone-500">{MTG_COLOR_NAMES[color]}</span></label>)}</div></fieldset>;
}

function defaultCondition(gameModes: RuleBuilderGameMode[]): AchievementGameFactCondition {
  return { ...DEFAULT_CONDITION, value: gameModes.find((mode) => !mode.archivedAt)?.code ?? gameModes[0]?.code ?? "FREE_FOR_ALL" };
}

function NumericRuleInput({ value, min, max, step, disabled, onChange }: {
  value: number;
  min?: number;
  max?: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  // Preserve decimal input such as "6." while the numeric rule value changes.
  const [draft, setDraft] = useState({ value, text: String(value) });
  return <input type="number" required value={Object.is(draft.value, value) ? draft.text : String(value)} min={min} max={max} step={step} disabled={disabled} onChange={(event) => {
    const text = event.target.value;
    const next = text.trim() ? Number(text) : Number.NaN;
    setDraft({ value: next, text });
    onChange(next);
  }} className={`${inputClass} min-w-0`} />;
}

function defaultValue(fact: GameFactKey, operator: GameFactOperator, gameModes: RuleBuilderGameMode[], current?: AchievementConditionValue): AchievementConditionValue {
  const definition = GAME_FACT_DEFINITIONS[fact];
  if (definition.kind === "NUMBER") {
    const value = typeof current === "number" ? current : definition.min ?? 0;
    return operator === "BETWEEN" ? [value, value] : value;
  }
  if (definition.kind === "GAME_MODE") return gameModes.find((mode) => !mode.archivedAt)?.code ?? gameModes[0]?.code ?? "FREE_FOR_ALL";
  if (definition.kind === "MONARCHY_RULE") return MONARCHY_BANDIT_RULES[0];
  if (definition.kind === "ROLE") return GAME_PARTICIPANT_ROLES[0];
  if (definition.kind === "BOOLEAN") return true;
  return ["W"];
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-10 place-items-center rounded-lg border border-white/8 text-stone-500 transition hover:bg-white/7 hover:text-white disabled:opacity-35">{children}</button>;
}

function title(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
