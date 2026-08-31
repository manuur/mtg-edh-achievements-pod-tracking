"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crown, GripVertical, Plus, Shield, Swords, Users } from "lucide-react";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { DeckForm } from "@/components/forms/deck-form";
import { GAME_ROLE_LABELS, GAME_WINNING_CRITERIA_LABELS, modeUsesSeats, playerRule, requiredPlayerCount, type GameMode, type GameModeCatalogItem, type GameParticipantRole, type MonarchyBanditRule } from "@/lib/game-modes";
import { useLoadingRouter } from "@/lib/loading-router";
import { zonedLocalDateTimeToIso } from "@/lib/timezone";

type Member = { playerId: string; displayName: string; status: string };
type DeckRow = { deck: { id: string; ownerPlayerId: string; name: string; bracket: number; powerLevel: number | null }; ownerName: string };
type InitialParticipant = { playerId: string; deckId: string; seatPosition: number | null; modeRole: GameParticipantRole | null; isWinner: boolean };
type InitialGame = { id: string; version: number; gameMode: GameMode; monarchyBanditRule: MonarchyBanditRule | null; resultKind: "WIN" | "DRAW"; notes: string; participants: InitialParticipant[] };
type MonarchyFaction = "ROYAL" | "TRAITOR" | "BANDITS" | "";

const monarchyRoles: GameParticipantRole[] = ["KING", "KINGSGUARD", "TRAITOR", "BANDIT"];

export function GameForm({ podId, podTimezone, defaultMonarchyBanditRule, gameModes, members, initialDecks, initialPlayedAt, initialGame }: {
  podId: string;
  podTimezone: string;
  defaultMonarchyBanditRule?: MonarchyBanditRule;
  gameModes: GameModeCatalogItem[];
  members: Member[];
  initialDecks: DeckRow[];
  initialPlayedAt: string;
  initialGame?: InitialGame;
}) {
  const router = useLoadingRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const activeMembers = members.filter((member) => member.status === "ACTIVE");
  const orderedInitialParticipants = [...(initialGame?.participants ?? [])].sort((left, right) => (left.seatPosition ?? 99) - (right.seatPosition ?? 99));
  const defaultPlayers = orderedInitialParticipants.length ? orderedInitialParticipants.map((participant) => participant.playerId) : activeMembers.slice(0, 8).map((member) => member.playerId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [mode, setMode] = useState<GameMode>(initialGame?.gameMode ?? gameModes.find((item) => item.code === "FREE_FOR_ALL")?.code ?? gameModes[0]?.code ?? "FREE_FOR_ALL");
  const [selected, setSelected] = useState<string[]>(defaultPlayers);
  const [resultKind, setResultKind] = useState<"WIN" | "DRAW">(initialGame?.resultKind ?? "WIN");
  const [winnerIds, setWinnerIds] = useState<string[]>(orderedInitialParticipants.filter((participant) => participant.isWinner).map((participant) => participant.playerId));
  const [roles, setRoles] = useState<Record<string, GameParticipantRole | "">>(() => Object.fromEntries(activeMembers.map((member) => [member.playerId, orderedInitialParticipants.find((participant) => participant.playerId === member.playerId)?.modeRole ?? ""])));
  const [archenemyId, setArchenemyId] = useState(orderedInitialParticipants.find((participant) => participant.modeRole === "ARCHENEMY")?.playerId ?? defaultPlayers[0] ?? "");
  const [monarchyBanditRule, setMonarchyBanditRule] = useState<MonarchyBanditRule>(initialGame?.monarchyBanditRule ?? defaultMonarchyBanditRule ?? "ALL_BANDITS");
  const [monarchyFaction, setMonarchyFaction] = useState<MonarchyFaction>(() => inferMonarchyFaction(orderedInitialParticipants));
  const [deckRows, setDeckRows] = useState(initialDecks);
  const [deckChoice, setDeckChoice] = useState<Record<string, string>>(() => Object.fromEntries(activeMembers.map((member) => [member.playerId, orderedInitialParticipants.find((participant) => participant.playerId === member.playerId)?.deckId ?? initialDecks.find((row) => row.deck.ownerPlayerId === member.playerId)?.deck.id ?? ""])));
  const [deckOwner, setDeckOwner] = useState(activeMembers[0]?.playerId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const decksByOwner = useMemo(() => deckRows.reduce<Record<string, DeckRow[]>>((groups, row) => { (groups[row.deck.ownerPlayerId] ??= []).push(row); return groups; }, {}), [deckRows]);
  const selectedMembers = selected.map((playerId) => activeMembers.find((member) => member.playerId === playerId)).filter(Boolean) as Member[];
  const currentMode = gameModes.find((item) => item.code === mode) ?? gameModes[0];
  const systemMode = currentMode?.systemKey ?? null;

  function memberName(playerId: string) {
    return activeMembers.find((member) => member.playerId === playerId)?.displayName ?? "Unknown player";
  }

  function toggle(playerId: string) {
    if (!selected.includes(playerId) && selected.length >= (currentMode?.maxPlayers ?? 8)) { setError(`${currentMode?.name ?? "This mode"} allows at most ${currentMode?.maxPlayers ?? 8} players.`); return; }
    const next = selected.includes(playerId) ? selected.filter((id) => id !== playerId) : [...selected, playerId];
    setSelected(next);
    setWinnerIds((current) => current.filter((id) => next.includes(id)));
    if (!next.includes(archenemyId)) setArchenemyId(next[0] ?? "");
    setError(undefined);
  }

  function chooseMode(nextMode: GameMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setWinnerIds([]);
    setMonarchyFaction("");
    setRoles((current) => Object.fromEntries(Object.keys(current).map((playerId) => [playerId, ""])));
    setArchenemyId(selected[0] ?? "");
    setError(undefined);
  }

  function movePlayer(playerId: string, direction: -1 | 1) {
    const currentIndex = selected.indexOf(playerId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= selected.length) return;
    setSelected((current) => arrayMove(current, currentIndex, nextIndex));
    setWinnerIds([]);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = selected.indexOf(String(active.id));
    const newIndex = selected.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setSelected((current) => arrayMove(current, oldIndex, newIndex));
    setWinnerIds([]);
  }

  function participantConfigurationError() {
    if (!currentMode) return "Choose an active game mode.";
    if (!currentMode.automationReady && initialGame?.gameMode !== currentMode.code) return `${currentMode.name} needs its role achievements configured by the Superadmin before it can be used.`;
    const exactCount = requiredPlayerCount(currentMode);
    if (exactCount !== null && selected.length !== exactCount) return `${currentMode.name} requires exactly ${exactCount} players.`;
    if (selected.length < currentMode.minPlayers || selected.length > currentMode.maxPlayers) return `${currentMode.name} requires ${playerRule(currentMode).toLowerCase()}.`;
    if (selected.some((playerId) => !deckChoice[playerId])) return "Choose a deck for every selected player.";
    if (systemMode === "ARCHENEMY" && !selected.includes(archenemyId)) return "Choose the Archenemy.";
    if (systemMode === "MONARCHY") {
      const selectedRoles = selected.map((playerId) => roles[playerId]);
      if (selectedRoles.filter((role) => role === "KING").length !== 1 || selectedRoles.filter((role) => role === "KINGSGUARD").length !== 1 || selectedRoles.filter((role) => role === "TRAITOR").length !== 1 || selectedRoles.filter((role) => role === "BANDIT").length !== 3) return "Assign one King, one Kingsguard, one Traitor, and three Bandits.";
    }
    return undefined;
  }

  function continueToResult() {
    const issue = participantConfigurationError();
    if (issue) { setError(issue); return; }
    setError(undefined);
    setWinnerIds((current) => current.filter((playerId) => selected.includes(playerId)));
    setStep(3);
  }

  function chooseResultKind(next: "WIN" | "DRAW") {
    setResultKind(next);
    setWinnerIds([]);
    if (next === "DRAW") setMonarchyFaction("");
  }

  function chooseMonarchyFaction(faction: Exclude<MonarchyFaction, "">) {
    setMonarchyFaction(faction);
    const playerForRole = (role: GameParticipantRole) => selected.find((playerId) => roles[playerId] === role);
    if (faction === "ROYAL") setWinnerIds([playerForRole("KING")].filter(Boolean) as string[]);
    if (faction === "TRAITOR") setWinnerIds([playerForRole("TRAITOR")].filter(Boolean) as string[]);
    if (faction === "BANDITS") {
      const bandits = selected.filter((playerId) => roles[playerId] === "BANDIT");
      setWinnerIds(monarchyBanditRule === "ALL_BANDITS" ? bandits : []);
    }
  }

  function changeBanditRule(rule: MonarchyBanditRule) {
    setMonarchyBanditRule(rule);
    if (monarchyFaction === "BANDITS" && rule === "ALL_BANDITS") setWinnerIds(selected.filter((playerId) => roles[playerId] === "BANDIT"));
  }

  function outcomeError() {
    if (resultKind === "DRAW") return undefined;
    if (systemMode === "FREE_FOR_ALL" || systemMode === "PENTAGON") return winnerIds.length === 1 ? undefined : "Choose one winner.";
    if (systemMode === "ASTERISK") return winnerIds.length === 2 ? undefined : "Choose the winning pair.";
    if (systemMode === "ARCHENEMY") return winnerIds.length ? undefined : "Choose the winning side.";
    if (systemMode === "MONARCHY") {
      if (!monarchyFaction) return "Choose the winning Monarchy faction.";
      return winnerIds.length ? undefined : "Choose at least one winning player.";
    }
    if (currentMode?.winningCriteria === "ONE_WINNER") return winnerIds.length === 1 ? undefined : "Choose exactly one winner.";
    if (currentMode?.winningCriteria === "MULTIPLE_WINNERS") return winnerIds.length >= 2 ? undefined : "Choose at least two winners.";
    if (!winnerIds.length) return "Choose at least one winner.";
    return undefined;
  }

  async function submit(formData: FormData) {
    const issue = participantConfigurationError() ?? outcomeError();
    if (issue) { setError(issue); return; }
    setPending(true);
    setError(undefined);
    const participants = selected.map((playerId, index) => ({
      playerId,
      deckId: deckChoice[playerId],
      seatPosition: modeUsesSeats(systemMode) ? index + 1 : null,
      modeRole: systemMode === "ARCHENEMY" ? playerId === archenemyId ? "ARCHENEMY" as const : "HERO" as const : systemMode === "MONARCHY" ? roles[playerId] || null : null,
    }));
    const payload = {
      playedAt: zonedLocalDateTimeToIso(String(formData.get("playedAt")), podTimezone),
      gameMode: mode,
      monarchyBanditRule: systemMode === "MONARCHY" ? monarchyBanditRule : null,
      resultKind,
      winnerPlayerIds: resultKind === "DRAW" ? [] : winnerIds,
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

  return <div className="grid gap-6">
    <StepIndicator current={step} />
    <div className={step === 2 ? "grid gap-6 lg:grid-cols-[1fr_340px]" : "grid gap-6"}>
      <form action={submit} className="grid gap-6">
        {step === 1 && <ModeStep mode={mode} gameModes={gameModes} allowUnconfiguredModeCode={initialGame?.gameMode} chooseMode={chooseMode} onNext={() => { setError(undefined); setStep(2); }} />}

        {step === 2 && <>
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-violet-400/12 text-violet-200"><Users className="size-4" /></span><div><h2 className="font-display text-xl">Who’s at the table?</h2><p className="text-xs text-stone-500">{currentMode ? playerRule(currentMode) : "Choose players"}. Choose the deck each player used.</p></div></div>
            <div className="grid gap-3">{activeMembers.map((member) => {
              const checked = selected.includes(member.playerId);
              const memberDecks = decksByOwner[member.playerId] ?? [];
              return <div key={member.playerId} className={`grid gap-3 rounded-xl border p-3 transition sm:grid-cols-[1fr_1.2fr] sm:items-center ${checked ? "border-amber-300/25 bg-amber-300/5" : "border-white/7 bg-black/10"}`}><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={checked} onChange={() => toggle(member.playerId)} className="size-4 accent-amber-300" /><span className="text-sm font-semibold">{member.displayName}</span></label><select disabled={!checked} value={deckChoice[member.playerId]} onChange={(event) => setDeckChoice((current) => ({ ...current, [member.playerId]: event.target.value }))} className={inputClass}><option value="">Choose deck…</option>{memberDecks.map(({ deck }) => <option key={deck.id} value={deck.id}>{deck.name} · B{deck.bracket}</option>)}</select></div>;
            })}</div>
          </Card>

          {modeUsesSeats(systemMode) && <Card className="grid gap-4 p-5 sm:p-6">
            <div><h2 className="font-display text-xl">Clockwise seating</h2><p className="mt-1 text-xs leading-5 text-stone-500">Drag players or use the arrow buttons. Seat 1 is arbitrary; only relative positions matter.</p></div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={selected} strategy={verticalListSortingStrategy}><div className="grid gap-2">{selected.map((playerId, index) => <SortableSeat key={playerId} playerId={playerId} name={memberName(playerId)} seat={index + 1} first={index === 0} last={index === selected.length - 1} onMove={movePlayer} />)}</div></SortableContext></DndContext>
            {systemMode === "ASTERISK" && selected.length === 6 && <div className="grid gap-2 rounded-xl border border-violet-300/15 bg-violet-300/5 p-4 sm:grid-cols-3">{asteriskPairs(selected).map((pair, index) => <div key={pair.join(":")}><p className="text-[10px] font-bold tracking-[.12em] text-violet-300 uppercase">Team {index + 1}</p><p className="mt-1 text-sm">{memberName(pair[0])} + {memberName(pair[1])}</p></div>)}</div>}
          </Card>}

          {systemMode === "ARCHENEMY" && <Card className="grid gap-4 p-5 sm:p-6"><div><h2 className="font-display text-xl">Choose the Archenemy</h2><p className="mt-1 text-xs text-stone-500">Every other selected player is automatically assigned to the Heroes team.</p></div><Field label="Archenemy"><select value={archenemyId} onChange={(event) => { setArchenemyId(event.target.value); setWinnerIds([]); }} className={inputClass}><option value="">Choose player…</option>{selectedMembers.map((member) => <option key={member.playerId} value={member.playerId}>{member.displayName}</option>)}</select></Field></Card>}

          {systemMode === "MONARCHY" && <Card className="grid gap-5 p-5 sm:p-6">
            <div><h2 className="font-display text-xl">Record the hidden roles</h2><p className="mt-1 text-xs leading-5 text-stone-500">Roles are entered after play and become visible to every POD member once the game is saved.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">{selectedMembers.map((member) => <Field key={member.playerId} label={member.displayName}><select value={roles[member.playerId]} onChange={(event) => { setRoles((current) => ({ ...current, [member.playerId]: event.target.value as GameParticipantRole | "" })); setWinnerIds([]); setMonarchyFaction(""); }} className={inputClass}><option value="">Choose role…</option>{monarchyRoles.map((role) => <option key={role} value={role} disabled={role !== "BANDIT" && selected.some((playerId) => playerId !== member.playerId && roles[playerId] === role)}>{GAME_ROLE_LABELS[role]}</option>)}</select></Field>)}</div>
            <Field label="Bandit victory rule"><select value={monarchyBanditRule} onChange={(event) => changeBanditRule(event.target.value as MonarchyBanditRule)} className={inputClass}><option value="ALL_BANDITS">All Bandits win when the King dies</option><option value="SURVIVING_BANDITS">Only surviving Bandits win when the King dies</option></select></Field>
            <p className="text-xs leading-5 text-stone-500">This choice becomes the default for the next Monarchy game in this POD.</p>
          </Card>}

          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button type="button" variant="secondary" onClick={() => { setError(undefined); setStep(1); }}><ArrowLeft className="size-4" /> Mode</Button><Button type="button" onClick={continueToResult}>Record result <ArrowRight className="size-4" /></Button></div>
        </>}

        {step === 3 && <Card className="grid gap-5 p-5 sm:p-6">
          <div><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Step 3 · {currentMode?.name ?? mode}</p><h2 className="font-display mt-1 text-2xl">Record the outcome</h2></div>
          <div className="grid gap-3 sm:grid-cols-2"><button type="button" aria-pressed={resultKind === "WIN"} onClick={() => chooseResultKind("WIN")} className={`rounded-xl border p-4 text-left ${resultKind === "WIN" ? "border-emerald-300/30 bg-emerald-300/8" : "border-white/8"}`}><span className="flex items-center gap-2 font-semibold"><Swords className="size-4" /> Victory</span><span className="mt-1 block text-xs text-stone-500">Choose the valid winner or winning side.</span></button><button type="button" aria-pressed={resultKind === "DRAW"} onClick={() => chooseResultKind("DRAW")} className={`rounded-xl border p-4 text-left ${resultKind === "DRAW" ? "border-stone-300/30 bg-white/7" : "border-white/8"}`}><span className="font-semibold">Draw</span><span className="mt-1 block text-xs text-stone-500">Every mode can end without a winner.</span></button></div>
          {resultKind === "WIN" && currentMode && <ModeOutcome mode={currentMode} selected={selected} winnerIds={winnerIds} roles={roles} archenemyId={archenemyId} monarchyFaction={monarchyFaction} monarchyBanditRule={monarchyBanditRule} memberName={memberName} setWinnerIds={setWinnerIds} setMonarchyFaction={chooseMonarchyFaction} />}
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Played at"><input required name="playedAt" type="datetime-local" defaultValue={initialPlayedAt} className={inputClass} /></Field><Field label="Notes · optional"><textarea name="notes" defaultValue={initialGame?.notes} maxLength={1000} rows={3} className={`${inputClass} h-auto py-3`} placeholder="That board wipe changed everything…" /></Field></div>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><Button type="button" variant="secondary" onClick={() => { setError(undefined); setStep(2); }}><ArrowLeft className="size-4" /> Table</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : initialGame ? "Save game" : "Record game"}</Button></div>
        </Card>}
      </form>

      {step === 2 && <Card className="h-fit p-5"><div className="mb-4 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-amber-300/10 text-amber-200"><Plus className="size-4" /></span><div><h2 className="font-display text-xl">Missing a deck?</h2><p className="text-xs text-stone-500">Add one without leaving game entry.</p></div></div><Field label="Player"><select value={deckOwner} onChange={(event) => setDeckOwner(event.target.value)} className={inputClass}>{activeMembers.map((member) => <option key={member.playerId} value={member.playerId}>{member.displayName}</option>)}</select></Field><div className="mt-4"><DeckForm ownerPlayerId={deckOwner} onCreated={(deck) => { const ownerName = activeMembers.find((member) => member.playerId === deck.ownerPlayerId)?.displayName ?? "Player"; setDeckRows((rows) => [...rows, { deck, ownerName }]); setDeckChoice((current) => ({ ...current, [deck.ownerPlayerId]: deck.id })); }} /></div></Card>}
    </div>
  </div>;
}

function ModeStep({ mode, gameModes, allowUnconfiguredModeCode, chooseMode, onNext }: { mode: GameMode; gameModes: GameModeCatalogItem[]; allowUnconfiguredModeCode?: string; chooseMode: (mode: GameMode) => void; onNext: () => void }) {
  return <Card className="grid gap-5 p-5 sm:p-6"><div><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Step 1</p><h2 className="font-display mt-1 text-2xl">Choose a game mode</h2><p className="mt-1 text-sm text-stone-500">The mode controls player count, seating, teams, roles, and valid winners. Every mode can end in a draw.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{gameModes.map((gameMode) => { const active = mode === gameMode.code; const unavailable = !gameMode.automationReady && allowUnconfiguredModeCode !== gameMode.code; return <button key={gameMode.code} type="button" aria-pressed={active} disabled={unavailable} onClick={() => chooseMode(gameMode.code)} className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-amber-300/40 bg-amber-300/10 shadow-[0_12px_40px_rgba(251,191,36,.08)]" : "border-white/8 bg-black/10 hover:border-white/16"}`}><span className="flex items-center justify-between gap-3"><span className="font-semibold text-stone-100">{gameMode.name}</span><span className="text-[10px] font-bold tracking-[.12em] text-stone-500 uppercase">{playerRule(gameMode)}</span></span><span className="mt-2 block text-xs leading-5 text-stone-400">{gameMode.description}</span>{unavailable && <span className="mt-2 block text-xs font-semibold text-red-300">Achievement setup required</span>}</button>; })}</div><div className="flex justify-end"><Button type="button" onClick={onNext}>Configure table <ArrowRight className="size-4" /></Button></div></Card>;
}

function StepIndicator({ current }: { current: 1 | 2 | 3 }) {
  return <ol aria-label="Game entry progress" className="grid grid-cols-3 gap-2">{["Mode", "Table", "Result"].map((label, index) => { const number = index + 1; const active = number === current; const complete = number < current; return <li key={label} aria-current={active ? "step" : undefined} className={`rounded-xl border px-3 py-2 text-center text-xs font-semibold ${active ? "border-amber-300/35 bg-amber-300/10 text-amber-200" : complete ? "border-emerald-300/20 bg-emerald-300/7 text-emerald-200" : "border-white/7 text-stone-600"}`}>{number}. {label}</li>; })}</ol>;
}

function SortableSeat({ playerId, name, seat, first, last, onMove }: { playerId: string; name: string; seat: number; first: boolean; last: boolean; onMove: (playerId: string, direction: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: playerId });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-3 rounded-xl border border-white/8 bg-black/15 p-3 ${isDragging ? "z-10 opacity-70 shadow-xl" : ""}`}><button type="button" aria-label={`Drag ${name} from seat ${seat}`} className="touch-none text-stone-500 hover:text-stone-200" {...attributes} {...listeners}><GripVertical className="size-4" /></button><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-violet-300/10 text-sm font-bold text-violet-200">{seat}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span><div className="flex gap-1"><button type="button" disabled={first} onClick={() => onMove(playerId, -1)} aria-label={`Move ${name} one seat up`} className="grid size-8 place-items-center rounded-lg border border-white/8 text-stone-400 disabled:opacity-25"><ArrowUp className="size-3.5" /></button><button type="button" disabled={last} onClick={() => onMove(playerId, 1)} aria-label={`Move ${name} one seat down`} className="grid size-8 place-items-center rounded-lg border border-white/8 text-stone-400 disabled:opacity-25"><ArrowDown className="size-3.5" /></button></div></div>;
}

function ModeOutcome({ mode, selected, winnerIds, roles, archenemyId, monarchyFaction, monarchyBanditRule, memberName, setWinnerIds, setMonarchyFaction }: { mode: GameModeCatalogItem; selected: string[]; winnerIds: string[]; roles: Record<string, GameParticipantRole | "">; archenemyId: string; monarchyFaction: MonarchyFaction; monarchyBanditRule: MonarchyBanditRule; memberName: (playerId: string) => string; setWinnerIds: (ids: string[]) => void; setMonarchyFaction: (faction: Exclude<MonarchyFaction, "">) => void }) {
  const systemMode = mode.systemKey;
  if (systemMode === "FREE_FOR_ALL" || systemMode === "PENTAGON") {
    const winnerId = winnerIds[0] ?? "";
    const winnerIndex = selected.indexOf(winnerId);
    const pentagonOpponents = winnerIndex >= 0 ? [selected[(winnerIndex + 2) % 5], selected[(winnerIndex + 3) % 5]] : [];
    return <div className="grid gap-3"><Field label="Winner"><select value={winnerId} onChange={(event) => setWinnerIds(event.target.value ? [event.target.value] : [])} className={inputClass}><option value="">Choose winner…</option>{selected.map((playerId) => <option key={playerId} value={playerId}>{memberName(playerId)}</option>)}</select></Field>{systemMode === "PENTAGON" && pentagonOpponents.length === 2 && <p className="rounded-xl border border-amber-300/15 bg-amber-300/6 p-3 text-xs leading-5 text-stone-300"><strong>{memberName(winnerId)}</strong> wins by defeating the two non-adjacent opponents: <strong>{memberName(pentagonOpponents[0])}</strong> and <strong>{memberName(pentagonOpponents[1])}</strong>.</p>}</div>;
  }
  if (systemMode === "ASTERISK") return <div className="grid gap-2 sm:grid-cols-3">{asteriskPairs(selected).map((pair, index) => { const active = pair.every((playerId) => winnerIds.includes(playerId)); return <button key={pair.join(":")} type="button" aria-pressed={active} onClick={() => setWinnerIds(pair)} className={`rounded-xl border p-4 text-left ${active ? "border-violet-300/35 bg-violet-300/10" : "border-white/8"}`}><span className="text-[10px] font-bold tracking-[.12em] text-violet-300 uppercase">Team {index + 1}</span><span className="mt-1 block text-sm font-semibold">{memberName(pair[0])}</span><span className="block text-sm font-semibold">{memberName(pair[1])}</span></button>; })}</div>;
  if (systemMode === "ARCHENEMY") {
    const heroes = selected.filter((playerId) => playerId !== archenemyId);
    const archenemyWins = winnerIds.length === 1 && winnerIds[0] === archenemyId;
    const heroesWin = heroes.length > 0 && heroes.every((playerId) => winnerIds.includes(playerId));
    return <div className="grid gap-3 sm:grid-cols-2"><button type="button" aria-pressed={archenemyWins} onClick={() => setWinnerIds([archenemyId])} className={`rounded-xl border p-4 text-left ${archenemyWins ? "border-red-300/30 bg-red-300/8" : "border-white/8"}`}><span className="flex items-center gap-2 font-semibold"><Crown className="size-4" /> Archenemy wins</span><span className="mt-1 block text-xs text-stone-500">{memberName(archenemyId)} wins alone.</span></button><button type="button" aria-pressed={heroesWin} onClick={() => setWinnerIds(heroes)} className={`rounded-xl border p-4 text-left ${heroesWin ? "border-emerald-300/30 bg-emerald-300/8" : "border-white/8"}`}><span className="flex items-center gap-2 font-semibold"><Shield className="size-4" /> Heroes win</span><span className="mt-1 block text-xs text-stone-500">Every Hero shares the victory.</span></button></div>;
  }
  if (systemMode !== "MONARCHY") {
    const single = mode.winningCriteria === "ONE_WINNER";
    return <div className="grid gap-3"><p className="text-sm text-stone-400">{GAME_WINNING_CRITERIA_LABELS[mode.winningCriteria]}</p><div className="grid gap-2 sm:grid-cols-2">{selected.map((playerId) => { const checked = winnerIds.includes(playerId); return <label key={playerId} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${checked ? "border-emerald-300/25 bg-emerald-300/7" : "border-white/8"}`}><input type={single ? "radio" : "checkbox"} name={single ? "genericWinner" : undefined} checked={checked} onChange={(event) => setWinnerIds(single ? event.target.checked ? [playerId] : [] : event.target.checked ? [...winnerIds, playerId] : winnerIds.filter((id) => id !== playerId))} className="size-4 accent-amber-300" /><span className="text-sm font-semibold">{memberName(playerId)}</span></label>; })}</div></div>;
  }
  const playerForRole = (role: GameParticipantRole) => selected.find((playerId) => roles[playerId] === role);
  const king = playerForRole("KING"); const guard = playerForRole("KINGSGUARD"); const traitor = playerForRole("TRAITOR"); const bandits = selected.filter((playerId) => roles[playerId] === "BANDIT");
  return <div className="grid gap-4"><div className="grid gap-2 sm:grid-cols-3"><OutcomeButton label="Royal" description="The King wins, optionally with the Kingsguard." active={monarchyFaction === "ROYAL"} onClick={() => setMonarchyFaction("ROYAL")} /><OutcomeButton label="Traitor" description="The Traitor is the sole winner." active={monarchyFaction === "TRAITOR"} onClick={() => setMonarchyFaction("TRAITOR")} /><OutcomeButton label="Bandits" description={monarchyBanditRule === "ALL_BANDITS" ? "All three Bandits win." : "Only selected survivors win."} active={monarchyFaction === "BANDITS"} onClick={() => setMonarchyFaction("BANDITS")} /></div>{monarchyFaction === "ROYAL" && king && guard && <div className="rounded-xl border border-white/8 p-4"><p className="text-sm font-semibold">{memberName(king)} wins as King.</p><label className="mt-3 flex items-center gap-3 text-sm text-stone-300"><input type="checkbox" checked={winnerIds.includes(guard)} onChange={(event) => setWinnerIds(event.target.checked ? [king, guard] : [king])} className="size-4 accent-amber-300" /> Kingsguard {memberName(guard)} shares the victory</label></div>}{monarchyFaction === "TRAITOR" && traitor && <p className="rounded-xl border border-red-300/15 bg-red-300/5 p-4 text-sm"><strong>{memberName(traitor)}</strong> wins alone as the Traitor.</p>}{monarchyFaction === "BANDITS" && <div className="grid gap-2">{bandits.map((playerId) => <label key={playerId} className={`flex items-center gap-3 rounded-xl border p-3 ${winnerIds.includes(playerId) ? "border-emerald-300/20 bg-emerald-300/7" : "border-white/8"}`}><input type="checkbox" disabled={monarchyBanditRule === "ALL_BANDITS"} checked={winnerIds.includes(playerId)} onChange={(event) => setWinnerIds(event.target.checked ? [...winnerIds, playerId] : winnerIds.filter((id) => id !== playerId))} className="size-4 accent-amber-300" /><span className="text-sm font-semibold">{memberName(playerId)}</span>{monarchyBanditRule === "SURVIVING_BANDITS" && <span className="text-xs text-stone-500">Survived until the King died</span>}</label>)}</div>}</div>;
}

function OutcomeButton({ label, description, active, onClick }: { label: string; description: string; active: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-xl border p-4 text-left ${active ? "border-amber-300/30 bg-amber-300/8" : "border-white/8"}`}><span className="font-semibold">{label}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{description}</span></button>;
}

function asteriskPairs(selected: string[]) {
  if (selected.length !== 6) return [];
  return [[selected[0], selected[3]], [selected[1], selected[4]], [selected[2], selected[5]]];
}

function inferMonarchyFaction(participants: InitialParticipant[]): MonarchyFaction {
  const winners = participants.filter((participant) => participant.isWinner);
  if (winners.some((participant) => participant.modeRole === "KING")) return "ROYAL";
  if (winners.some((participant) => participant.modeRole === "TRAITOR")) return "TRAITOR";
  if (winners.some((participant) => participant.modeRole === "BANDIT")) return "BANDITS";
  return "";
}
