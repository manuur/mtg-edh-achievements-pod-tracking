"use client";

import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { MTG_COLORS, MTG_COLOR_NAMES, type MtgColor } from "@/lib/deck-metadata";
import { useLoadingRouter } from "@/lib/loading-router";

type DeckResult = {
  id: string;
  ownerPlayerId: string;
  name: string;
  bracket: number;
  powerLevel: number | null;
  commanderCmc: number | null;
  colorIdentity: MtgColor[] | null;
  hasPartnerCommanders?: boolean;
  hasCompanion?: boolean;
  hasBackground?: boolean;
  version?: number;
  moxfieldUrl?: string | null;
  archivedAt?: string | Date | null;
};

type ColorIdentityKind = "UNKNOWN" | "COLORLESS" | "COLORS";

export function DeckForm({ ownerPlayerId, existing, onCreated }: { ownerPlayerId: string; existing?: DeckResult; onCreated?: (deck: DeckResult) => void }) {
  const router = useLoadingRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [colorIdentityKind, setColorIdentityKind] = useState<ColorIdentityKind>(
    existing?.colorIdentity === null || existing?.colorIdentity === undefined
      ? "UNKNOWN"
      : existing.colorIdentity.length === 0 ? "COLORLESS" : "COLORS",
  );

  async function submit(formData: FormData) {
    setPending(true);
    setError(undefined);
    try {
      const powerLevel = String(formData.get("powerLevel") ?? "").trim();
      const commanderCmc = String(formData.get("commanderCmc") ?? "").trim();
      const selectedColors = formData.getAll("colorIdentity").map(String) as MtgColor[];
      if (colorIdentityKind === "COLORS" && selectedColors.length === 0) {
        setError("Choose at least one color, or select Colorless.");
        return;
      }
      const fields = {
        name: formData.get("name"),
        bracket: Number(formData.get("bracket")),
        powerLevel: powerLevel ? Number(powerLevel) : null,
        commanderCmc: commanderCmc ? Number(commanderCmc) : null,
        colorIdentity: colorIdentityKind === "UNKNOWN" ? null : colorIdentityKind === "COLORLESS" ? [] : selectedColors,
        hasPartnerCommanders: formData.get("hasPartnerCommanders") === "on",
        hasCompanion: formData.get("hasCompanion") === "on",
        hasBackground: formData.get("hasBackground") === "on",
        moxfieldUrl: formData.get("moxfieldUrl"),
      };
      const deck = existing
        ? await apiRequest<DeckResult>(`/api/v1/decks/${existing.id}`, { method: "PATCH", body: JSON.stringify({ ...fields, version: existing.version }) })
        : await apiRequest<DeckResult>("/api/v1/decks", { method: "POST", body: JSON.stringify({ ownerPlayerId, ...fields }) });
      router.refresh();
      onCreated?.(deck);
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not save the deck.");
    } finally {
      setPending(false);
    }
  }

  async function setArchived(archived: boolean) {
    if (!existing?.version) return;
    if (archived && !window.confirm("Archive this deck? It remains on historical games.")) return;
    setPending(true);
    setError(undefined);
    try {
      await apiRequest(`/api/v1/decks/${existing.id}`, {
        method: archived ? "DELETE" : "PATCH",
        body: JSON.stringify(archived ? { version: existing.version } : { version: existing.version, archived: false }),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not update the deck.");
    } finally {
      setPending(false);
    }
  }

  return <form action={submit} className="grid gap-4">
    <Field label="Deck name"><input name="name" required maxLength={80} defaultValue={existing?.name} className={inputClass} placeholder="Alela Enchantments" /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Bracket"><select name="bracket" defaultValue={String(existing?.bracket ?? 3)} className={inputClass}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>Bracket {value}</option>)}</select></Field>
      <Field label="Power level · optional"><input name="powerLevel" type="number" min="0" max="10" step="0.01" defaultValue={existing?.powerLevel ?? ""} className={inputClass} placeholder="0–10" /></Field>
    </div>
    <Field label="Commander CMC · optional">
      <input name="commanderCmc" type="number" min="0" step="1" defaultValue={existing?.commanderCmc ?? ""} className={inputClass} placeholder="Printed mana value" />
      <span className="mt-1 block text-xs leading-5 text-stone-500">Enter the Commander card’s printed mana value as a whole number. Colored, colorless, and generic mana all count.</span>
    </Field>
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium text-stone-300">Color identity · optional</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {(["UNKNOWN", "COLORLESS", "COLORS"] as const).map((kind) => <label key={kind} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${colorIdentityKind === kind ? "border-amber-300/35 bg-amber-300/8 text-amber-100" : "border-white/8 text-stone-400"}`}>
          <input type="radio" name="colorIdentityKind" value={kind} checked={colorIdentityKind === kind} onChange={() => setColorIdentityKind(kind)} className="accent-amber-300" />
          {kind === "UNKNOWN" ? "Unknown" : kind === "COLORLESS" ? "Colorless" : "Choose colors"}
        </label>)}
      </div>
      {colorIdentityKind === "COLORS" && <div className="flex flex-wrap gap-2" aria-label="Commander color identity">
        {MTG_COLORS.map((color) => <label key={color} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-black/10 px-3 text-sm">
          <input name="colorIdentity" type="checkbox" value={color} defaultChecked={existing?.colorIdentity?.includes(color)} className="accent-amber-300" />
          <span className="font-semibold">{color}</span><span className="text-stone-500">{MTG_COLOR_NAMES[color]}</span>
        </label>)}
      </div>}
    </fieldset>
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium text-stone-300">Commander configuration</legend>
      <p className="text-xs leading-5 text-stone-500">Declare these traits manually. They are snapshotted when a game is recorded and can power automatic achievements.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {([
          ["hasPartnerCommanders", "Partner commanders", existing?.hasPartnerCommanders],
          ["hasCompanion", "Companion", existing?.hasCompanion],
          ["hasBackground", "Background", existing?.hasBackground],
        ] as const).map(([name, label, checked]) => <label key={name} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/8 bg-black/10 px-3 text-sm text-stone-300">
          <input name={name} type="checkbox" defaultChecked={checked ?? false} className="accent-amber-300" />
          {label}
        </label>)}
      </div>
    </fieldset>
    <Field label="Moxfield link · optional"><input name="moxfieldUrl" type="url" defaultValue={existing?.moxfieldUrl ?? ""} className={inputClass} placeholder="https://moxfield.com/decks/..." /></Field>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending} type="submit">{pending ? "Saving…" : existing ? "Save deck" : "Add deck"}</Button>
      {existing && <Button type="button" variant={existing.archivedAt ? "secondary" : "danger"} disabled={pending} onClick={() => setArchived(!existing.archivedAt)}>{existing.archivedAt ? "Restore deck" : "Archive deck"}</Button>}
    </div>
  </form>;
}
