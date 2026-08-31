"use client";

import { Archive, LockKeyhole, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import {
  GAME_WINNING_CRITERIA,
  GAME_WINNING_CRITERIA_LABELS,
  GAME_ROLE_LABELS,
  playerRule,
  requiredAchievementRoles,
  type GameModeCatalogItem,
  type GameModeWinAchievementRule,
  type GameParticipantRole,
  type GameWinningCriteria,
} from "@/lib/game-modes";
import { useLoadingRouter } from "@/lib/loading-router";

type AchievementOption = { id: string; name: string; category: string; archivedAt: Date | string | null };

export function GameModeCatalogManager({ gameModes, achievements }: { gameModes: GameModeCatalogItem[]; achievements: AchievementOption[] }) {
  const router = useLoadingRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<GameModeCatalogItem>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [formRevision, setFormRevision] = useState(0);

  function beginEditing(mode: GameModeCatalogItem) {
    setEditing(mode);
    setError(undefined);
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      editor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      editor.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
    });
  }

  async function create(formData: FormData) {
    setPending(true); setError(undefined);
    try {
      await apiRequest("/api/v1/admin/game-modes", { method: "POST", body: JSON.stringify(readFields(formData)) });
      setFormRevision((revision) => revision + 1);
      router.refresh();
    } catch (cause) { setError(message(cause, "Could not create the game mode.")); }
    finally { setPending(false); }
  }

  async function save(formData: FormData) {
    if (!editing) return;
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/admin/game-modes/${editing.code}`, {
        method: "PATCH",
        body: JSON.stringify({ ...readFields(formData, editing), version: editing.version }),
      });
      setEditing(undefined);
      router.refresh();
    } catch (cause) { setError(message(cause, "Could not save the game mode.")); }
    finally { setPending(false); }
  }

  async function setArchived(mode: GameModeCatalogItem, archived: boolean) {
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/admin/game-modes/${mode.code}`, {
        method: archived ? "DELETE" : "PATCH",
        body: JSON.stringify(archived ? { version: mode.version } : {
          name: mode.name,
          description: mode.description,
          minPlayers: mode.minPlayers,
          maxPlayers: mode.maxPlayers,
          winningCriteria: mode.winningCriteria,
          winAchievementRules: mode.winAchievementRules,
          version: mode.version,
          archived: false,
        }),
      });
      if (editing?.code === mode.code) setEditing(undefined);
      router.refresh();
    } catch (cause) { setError(message(cause, `Could not ${archived ? "archive" : "restore"} the game mode.`)); }
    finally { setPending(false); }
  }

  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
    <section aria-labelledby="game-mode-catalog-heading" className="grid min-w-0 content-start gap-4">
      <div className="px-1"><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Global catalog</p><h2 id="game-mode-catalog-heading" className="font-display mt-1 text-2xl">{gameModes.length} game modes</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">Archived modes remain visible on historical games but cannot be selected for a new game. Every mode always allows a draw.</p></div>
      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/8 p-3 text-sm text-red-300">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-2">{gameModes.map((mode) => <Card key={mode.code} className="flex min-w-0 flex-col p-5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-display break-words text-xl">{mode.name}</h3>{mode.systemKey && <Badge tone="violet">System</Badge>}{mode.archivedAt && <Badge>Archived</Badge>}</div><code className="mt-1 block text-[11px] text-stone-600">{mode.code}</code></div><div className="flex shrink-0 gap-1"><button type="button" disabled={pending} onClick={() => beginEditing(mode)} aria-label={`Edit ${mode.name}`} className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-white/7 hover:text-white"><Pencil className="size-4" /></button><button type="button" disabled={pending} onClick={() => void setArchived(mode, !mode.archivedAt)} aria-label={`${mode.archivedAt ? "Restore" : "Archive"} ${mode.name}`} className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-white/7 hover:text-white">{mode.archivedAt ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}</button></div></div>
        <p className="mt-4 flex-1 text-sm leading-6 text-stone-400">{mode.description || "No description"}</p>
        <div className="mt-4 flex flex-wrap gap-2"><Badge tone="amber">{playerRule(mode)}</Badge><Badge tone="green">{GAME_WINNING_CRITERIA_LABELS[mode.winningCriteria]}</Badge><Badge>Draw allowed</Badge>{!mode.automationReady && <Badge tone="red">Achievement setup required</Badge>}</div>
        {mode.winAchievementRules.length > 0 && <p className="mt-3 text-xs leading-5 text-stone-500">{mode.winAchievementRules.map((rule) => `${rule.winnerRole ? GAME_ROLE_LABELS[rule.winnerRole] : "Win"}: ${achievements.find((achievement) => achievement.id === rule.achievementId)?.name ?? "Unknown achievement"}`).join(" · ")}</p>}
      </Card>)}</div>
    </section>
    <div ref={editorRef} className="scroll-mt-24"><Card className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2">{editing ? <Pencil className="size-4 text-violet-200" /> : <Plus className="size-4 text-amber-200" />}<h2 className="font-display text-xl">{editing ? "Edit game mode" : "Add game mode"}</h2></div>{editing && <button type="button" onClick={() => setEditing(undefined)} aria-label="Cancel editing" className="text-stone-500 hover:text-white"><X className="size-4" /></button>}</div><GameModeForm key={`${editing?.code ?? "new"}:${formRevision}`} mode={editing} achievements={achievements} pending={pending} action={editing ? save : create} /></Card></div>
  </div>;
}

function GameModeForm({ mode, achievements, pending, action }: { mode?: GameModeCatalogItem; achievements: AchievementOption[]; pending: boolean; action: (data: FormData) => void | Promise<void> }) {
  const system = Boolean(mode?.systemKey);
  const requiredRoles = requiredAchievementRoles(mode?.systemKey ?? null);
  const rulesByRole = new Map(mode?.winAchievementRules.map((rule) => [rule.winnerRole ?? "GENERAL", rule.achievementId]));
  return <form action={action} className="grid gap-3">
    <Field label="Name"><input name="name" required maxLength={80} defaultValue={mode?.name} className={inputClass} /></Field>
    <Field label="Description"><textarea name="description" maxLength={1000} rows={5} defaultValue={mode?.description} className={`${inputClass} h-auto py-3`} /></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Minimum players"><input name="minPlayers" type="number" required min={2} max={8} defaultValue={mode?.minPlayers ?? 2} disabled={system} className={inputClass} /></Field><Field label="Maximum players"><input name="maxPlayers" type="number" required min={2} max={8} defaultValue={mode?.maxPlayers ?? 8} disabled={system} className={inputClass} /></Field></div>
    <Field label="Winning criteria"><select name="winningCriteria" defaultValue={mode?.winningCriteria ?? "ONE_WINNER"} disabled={system} className={inputClass}>{GAME_WINNING_CRITERIA.map((criteria) => <option key={criteria} value={criteria}>{GAME_WINNING_CRITERIA_LABELS[criteria]}</option>)}</select></Field>
    {system && <><input type="hidden" name="minPlayers" value={mode?.minPlayers} /><input type="hidden" name="maxPlayers" value={mode?.maxPlayers} /><input type="hidden" name="winningCriteria" value={mode?.winningCriteria} /><p className="flex gap-2 rounded-xl border border-violet-300/15 bg-violet-300/7 p-3 text-xs leading-5 text-violet-200"><LockKeyhole className="mt-0.5 size-4 shrink-0" />Built-in limits and winning rules are locked because their seating, team, and role validation depends on them. Their name and description remain editable.</p></>}
    {requiredRoles.length ? <fieldset className="grid gap-3 rounded-xl border border-white/8 p-4"><legend className="px-1 text-sm font-semibold text-stone-200">Automatic role achievements</legend>{requiredRoles.map((role) => <AchievementSelect key={role} role={role} label={`${GAME_ROLE_LABELS[role]} win`} defaultValue={rulesByRole.get(role)} achievements={achievements} required={!mode?.archivedAt} />)}<p className="text-xs leading-5 text-stone-500">Every winning player receives the achievement mapped to their saved role. All roles are required while this mode is active.</p></fieldset> : <AchievementSelect role={null} label="Automatic win achievement · optional" defaultValue={rulesByRole.get("GENERAL")} achievements={achievements} />}
    <p className="text-xs leading-5 text-stone-500">Draw is automatically available and cannot be disabled.</p>
    <Button disabled={pending}>{mode ? "Save game mode" : "Add game mode"}</Button>
  </form>;
}

function AchievementSelect({ role, label, defaultValue, achievements, required = false }: { role: GameParticipantRole | null; label: string; defaultValue?: string; achievements: AchievementOption[]; required?: boolean }) {
  const active = achievements.filter((achievement) => !achievement.archivedAt);
  const categories = [...new Set(active.map((achievement) => achievement.category))];
  return <Field label={label}><select name={`achievement:${role ?? "GENERAL"}`} defaultValue={defaultValue ?? ""} required={required} className={inputClass}><option value="">{required ? "Choose achievement…" : "No automatic achievement"}</option>{categories.map((category) => <optgroup key={category} label={category}>{active.filter((achievement) => achievement.category === category).map((achievement) => <option key={achievement.id} value={achievement.id}>{achievement.name}</option>)}</optgroup>)}</select></Field>;
}

function readFields(formData: FormData, mode?: GameModeCatalogItem) {
  const roles = requiredAchievementRoles(mode?.systemKey ?? null);
  const slots: (GameParticipantRole | null)[] = roles.length ? roles : [null];
  const winAchievementRules = slots.flatMap((winnerRole): GameModeWinAchievementRule[] => {
    const achievementId = String(formData.get(`achievement:${winnerRole ?? "GENERAL"}`) ?? "");
    return achievementId ? [{ winnerRole, achievementId }] : [];
  });
  return {
    name: formData.get("name"),
    description: formData.get("description"),
    minPlayers: Number(formData.get("minPlayers")),
    maxPlayers: Number(formData.get("maxPlayers")),
    winningCriteria: formData.get("winningCriteria") as GameWinningCriteria,
    winAchievementRules,
  };
}

function message(cause: unknown, fallback: string) { return cause instanceof ApiClientError ? cause.message : fallback; }
