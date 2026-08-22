"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { DeckForm } from "@/components/forms/deck-form";
import { zonedLocalDateTimeToIso } from "@/lib/timezone";

type Member = { playerId: string; displayName: string; status: string };
type DeckRow = { deck: { id: string; ownerPlayerId: string; name: string; bracket: number; powerLevel: number }; ownerName: string };
type InitialGame = {
  id: string;
  version: number;
  resultKind: "WIN" | "DRAW";
  winnerPlayerId: string | null;
  notes: string;
  participants: { playerId: string; deckId: string }[];
};

export function GameForm({
  podId, podTimezone, members, initialDecks, initialPlayedAt, initialGame,
}: {
  podId: string;
  podTimezone: string;
  members: Member[];
  initialDecks: DeckRow[];
  initialPlayedAt: string;
  initialGame?: InitialGame;
}) {
  const router = useRouter();
  const activeMembers = members.filter((member) => member.status === "ACTIVE");
  const defaultPlayers = initialGame?.participants.map((participant) => participant.playerId)
    ?? activeMembers.slice(0, 4).map((member) => member.playerId);
  const [selected, setSelected] = useState<string[]>(defaultPlayers);
  const [resultKind, setResultKind] = useState<"WIN" | "DRAW">(initialGame?.resultKind ?? "WIN");
  const [winner, setWinner] = useState(initialGame?.winnerPlayerId ?? activeMembers[0]?.playerId ?? "");
  const [deckRows, setDeckRows] = useState(initialDecks);
  const [deckChoice, setDeckChoice] = useState<Record<string, string>>(() => Object.fromEntries(
    activeMembers.map((member) => [
      member.playerId,
      initialGame?.participants.find((participant) => participant.playerId === member.playerId)?.deckId
        ?? initialDecks.find((row) => row.deck.ownerPlayerId === member.playerId)?.deck.id
        ?? "",
    ]),
  ));
  const [deckOwner, setDeckOwner] = useState(activeMembers[0]?.playerId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const decksByOwner = useMemo(() => deckRows.reduce<Record<string, DeckRow[]>>((groups, row) => {
    (groups[row.deck.ownerPlayerId] ??= []).push(row);
    return groups;
  }, {}), [deckRows]);

  function toggle(playerId: string) {
    if (!selected.includes(playerId) && selected.length >= 8) { setError("A game can have at most eight players."); return; }
    const next = selected.includes(playerId) ? selected.filter((id) => id !== playerId) : [...selected, playerId];
    setSelected(next);
    if (!next.includes(winner)) setWinner(next[0] ?? "");
  }

  async function submit(formData: FormData) {
    setPending(true); setError(undefined);
    const participants = selected.map((playerId) => ({ playerId, deckId: deckChoice[playerId] })).filter((participant) => participant.deckId);
    if (participants.length !== selected.length) {
      setError("Choose a deck for every selected player."); setPending(false); return;
    }
    const payload = {
      playedAt: zonedLocalDateTimeToIso(String(formData.get("playedAt")), podTimezone),
      resultKind,
      winnerPlayerId: resultKind === "DRAW" ? null : winner,
      notes: formData.get("notes"),
      participants,
      ...(initialGame ? { version: initialGame.version } : { idempotencyKey: crypto.randomUUID() }),
    };
    try {
      const path = initialGame ? `/api/v1/pods/${podId}/games/${initialGame.id}` : `/api/v1/pods/${podId}/games`;
      await apiRequest(path, { method: initialGame ? "PATCH" : "POST", body: JSON.stringify(payload) });
      router.push(initialGame ? `/pods/${podId}/games/${initialGame.id}` : `/pods/${podId}/games`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not save the game.");
      setPending(false);
    }
  }

  return <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
    <form action={submit} className="grid gap-6">
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-violet-400/12 text-violet-200"><Users className="size-4" /></span><div><h2 className="font-display text-xl">Who’s at the table?</h2><p className="text-xs text-stone-500">Choose 2–8 players and the deck each one played.</p></div></div>
        <div className="grid gap-3">{activeMembers.map((member) => {
          const checked = selected.includes(member.playerId);
          const memberDecks = decksByOwner[member.playerId] ?? [];
          return <div key={member.playerId} className={`grid gap-3 rounded-xl border p-3 transition sm:grid-cols-[1fr_1.2fr] sm:items-center ${checked ? "border-amber-300/25 bg-amber-300/5" : "border-white/7 bg-black/10"}`}><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={checked} onChange={() => toggle(member.playerId)} className="size-4 accent-amber-300" /><span className="text-sm font-semibold">{member.displayName}</span></label><select disabled={!checked} value={deckChoice[member.playerId]} onChange={(event) => setDeckChoice((current) => ({ ...current, [member.playerId]: event.target.value }))} className={inputClass}><option value="">Choose deck…</option>{memberDecks.map(({ deck }) => <option key={deck.id} value={deck.id}>{deck.name} · B{deck.bracket}</option>)}</select></div>;
        })}</div>
      </Card>
      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Played at"><input required name="playedAt" type="datetime-local" defaultValue={initialPlayedAt} className={inputClass} /></Field><Field label="Result"><select value={resultKind} onChange={(event) => setResultKind(event.target.value as "WIN" | "DRAW")} className={inputClass}><option value="WIN">One winner</option><option value="DRAW">Draw</option></select></Field></div>
        {resultKind === "WIN" && <Field label="Winner"><select value={winner} onChange={(event) => setWinner(event.target.value)} className={inputClass}>{activeMembers.filter((member) => selected.includes(member.playerId)).map((member) => <option key={member.playerId} value={member.playerId}>{member.displayName}</option>)}</select></Field>}
        <Field label="Notes · optional"><textarea name="notes" defaultValue={initialGame?.notes} maxLength={1000} rows={3} className={`${inputClass} h-auto py-3`} placeholder="That board wipe changed everything…" /></Field>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <Button disabled={pending || selected.length < 2}>{pending ? "Saving…" : initialGame ? "Save game" : "Record game"}</Button>
      </Card>
    </form>
    <Card className="h-fit p-5"><div className="mb-4 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-amber-300/10 text-amber-200"><Plus className="size-4" /></span><div><h2 className="font-display text-xl">Missing a deck?</h2><p className="text-xs text-stone-500">Add one without leaving game entry.</p></div></div><Field label="Player"><select value={deckOwner} onChange={(event) => setDeckOwner(event.target.value)} className={inputClass}>{activeMembers.map((member) => <option key={member.playerId} value={member.playerId}>{member.displayName}</option>)}</select></Field><div className="mt-4"><DeckForm ownerPlayerId={deckOwner} onCreated={(deck) => { const ownerName = activeMembers.find((member) => member.playerId === deck.ownerPlayerId)?.displayName ?? "Player"; setDeckRows((rows) => [...rows, { deck, ownerName }]); setDeckChoice((current) => ({ ...current, [deck.ownerPlayerId]: deck.id })); }} /></div></Card>
  </div>;
}
