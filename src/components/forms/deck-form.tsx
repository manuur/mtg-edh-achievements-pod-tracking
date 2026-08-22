"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, inputClass } from "@/components/ui";
import { ApiClientError, apiRequest } from "@/lib/client-api";

type DeckResult = { id: string; ownerPlayerId: string; name: string; bracket: number; powerLevel: number; version?: number; moxfieldUrl?: string | null; archivedAt?: string | Date | null };

export function DeckForm({ ownerPlayerId, existing, onCreated }: { ownerPlayerId: string; existing?: DeckResult; onCreated?: (deck: DeckResult) => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(formData: FormData) {
    setPending(true); setError(undefined);
    try {
      const fields = {
        name: formData.get("name"),
        bracket: Number(formData.get("bracket")),
        powerLevel: Number(formData.get("powerLevel")),
        moxfieldUrl: formData.get("moxfieldUrl"),
      };
      const deck = existing
        ? await apiRequest<DeckResult>(`/api/v1/decks/${existing.id}`, { method: "PATCH", body: JSON.stringify({ ...fields, version: existing.version }) })
        : await apiRequest<DeckResult>("/api/v1/decks", { method: "POST", body: JSON.stringify({ ownerPlayerId, ...fields }) });
      router.refresh(); onCreated?.(deck);
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Could not save the deck."); }
    finally { setPending(false); }
  }
  async function setArchived(archived: boolean) {
    if (!existing?.version) return;
    if (archived && !window.confirm("Archive this deck? It remains on historical games.")) return;
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/decks/${existing.id}`, {
        method: archived ? "DELETE" : "PATCH",
        body: JSON.stringify(archived ? { version: existing.version } : { version: existing.version, archived: false }),
      });
      router.refresh();
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Could not update the deck."); }
    finally { setPending(false); }
  }
  return <form action={submit} className="grid gap-4"><Field label="Deck name"><input name="name" required maxLength={80} defaultValue={existing?.name} className={inputClass} placeholder="Alela Enchantments" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Bracket"><select name="bracket" defaultValue={String(existing?.bracket ?? 3)} className={inputClass}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>Bracket {value}</option>)}</select></Field><Field label="Power level"><input name="powerLevel" required type="number" min="0" max="10" step="0.01" defaultValue={existing?.powerLevel ?? 5} className={inputClass} /></Field></div><Field label="Moxfield link · optional"><input name="moxfieldUrl" type="url" defaultValue={existing?.moxfieldUrl ?? ""} className={inputClass} placeholder="https://moxfield.com/decks/..." /></Field>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<div className="flex flex-wrap gap-2"><Button disabled={pending} type="submit">{pending ? "Saving…" : existing ? "Save deck" : "Add deck"}</Button>{existing && <Button type="button" variant={existing.archivedAt ? "secondary" : "danger"} disabled={pending} onClick={() => setArchived(!existing.archivedAt)}>{existing.archivedAt ? "Restore deck" : "Archive deck"}</Button>}</div></form>;
}
