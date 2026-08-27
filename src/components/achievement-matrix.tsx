"use client";

import { useMemo, useState } from "react";
import { useLoadingRouter } from "@/lib/loading-router";
import { Check, ChevronRight, LockKeyhole, X } from "lucide-react";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { Badge, Button, Card } from "@/components/ui";

type Catalog = {
  id: string;
  name: string;
  category: string;
  description: string;
  archivedAt: Date | string | null;
};

type Member = { id: string; displayName: string };

type Grant = {
  playerId: string;
  achievementId: string;
  gameId: string;
  earnedAt: Date | string;
  gameArchivedAt: Date | string | null;
  revokedAt: Date | string | null;
  version: number;
  grantedByName: string;
  notes: string;
};

type EligibleGame = {
  id: string;
  playedAt: Date | string;
  resultKind: "WIN" | "DRAW";
  winnerPlayerId: string | null;
  winnerName: string | null;
  winnerDeckName: string | null;
  playerDeckName: string;
  participantCount: number;
  notes: string;
};

type GrantTarget = { playerId: string; achievementId: string };

export function AchievementMatrix({
  podId,
  timeZone,
  catalog,
  members,
  grants,
  canEdit,
}: {
  podId: string;
  timeZone: string;
  catalog: Catalog[];
  members: Member[];
  grants: Grant[];
  canEdit: boolean;
}) {
  const router = useLoadingRouter();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const [category, setCategory] = useState("All");
  const [player, setPlayer] = useState("All");
  const [earned, setEarned] = useState("All");
  const [catalogState, setCatalogState] = useState("Active");
  const [grantTarget, setGrantTarget] = useState<GrantTarget>();
  const [eligibleGames, setEligibleGames] = useState<EligibleGame[]>([]);
  const [nextGameCursor, setNextGameCursor] = useState<string | null>(null);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [note, setNote] = useState("");
  const [loadingGames, setLoadingGames] = useState(false);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(
    () => new Set(members[0] ? [members[0].id] : []),
  );

  const activeGrants = useMemo(() => new Map(
    grants
      .filter((grant) => !grant.revokedAt && !grant.gameArchivedAt)
      .map((grant) => [`${grant.playerId}:${grant.achievementId}`, grant]),
  ), [grants]);
  const categories = ["All", ...new Set(catalog.filter((item) => !item.archivedAt).map((item) => item.category))];
  const visibleMembers = player === "All" ? members : members.filter((member) => member.id === player);
  const visible = catalog.filter((item) => {
    if (category !== "All" && item.category !== category) return false;
    if (catalogState === "Active" && item.archivedAt) return false;
    if (catalogState === "Archived" && !item.archivedAt) return false;
    if (earned === "All") return true;
    const relevantPlayers = player === "All" ? members : visibleMembers;
    const hasGrant = relevantPlayers.some((member) => activeGrants.has(`${member.id}:${item.id}`));
    return earned === "Earned" ? hasGrant : !hasGrant;
  });

  const targetPlayer = grantTarget ? members.find((member) => member.id === grantTarget.playerId) : undefined;
  const targetAchievement = grantTarget ? catalog.find((item) => item.id === grantTarget.achievementId) : undefined;

  function earnedDescription(grant: Grant) {
    const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone }).format(new Date(grant.earnedAt));
    return `Earned ${date} · recorded by ${grant.grantedByName}${grant.notes ? ` · ${grant.notes}` : ""}`;
  }

  function gameDescription(game: EligibleGame) {
    const date = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(new Date(game.playedAt));
    const winner = game.winnerName ?? "Unknown";
    const result = game.resultKind === "DRAW"
      ? "Draw"
      : `Winner: ${winner}${game.winnerDeckName ? ` (${game.winnerDeckName})` : ""}`;
    const recipientDeck = targetPlayer && game.winnerPlayerId !== grantTarget?.playerId
      ? ` · ${targetPlayer.displayName}: ${game.playerDeckName}`
      : "";
    return `${date} · ${result}${recipientDeck} · ${game.participantCount} players${game.notes ? ` · ${game.notes}` : ""}`;
  }

  function playerDeckNote(game?: EligibleGame) {
    return game?.playerDeckName ?? "";
  }

  function selectEligibleGame(gameId: string) {
    setSelectedGameId(gameId);
    setNote(playerDeckNote(eligibleGames.find((game) => game.id === gameId)));
  }

  function selectPlayer(value: string) {
    setPlayer(value);
    if (value !== "All") {
      setExpandedMembers((current) => new Set(current).add(value));
    }
  }

  function toggleMember(playerId: string) {
    setExpandedMembers((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  async function loadEligibleGames(playerId: string, cursor?: string, append = false) {
    setLoadingGames(true);
    setError(undefined);
    try {
      const query = new URLSearchParams({ playerId, limit: "25", ...(cursor ? { cursor } : {}) });
      const page = await apiRequest<{ items: EligibleGame[]; nextCursor: string | null }>(
        `/api/v1/pods/${podId}/achievement-games?${query}`,
      );
      setEligibleGames((current) => append ? [...current, ...page.items] : page.items);
      setNextGameCursor(page.nextCursor);
      if (!append) {
        setSelectedGameId(page.items[0]?.id ?? "");
        setNote(playerDeckNote(page.items[0]));
      }
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Eligible games could not be loaded.");
    } finally {
      setLoadingGames(false);
    }
  }

  function openGrant(playerId: string, achievementId: string) {
    setGrantTarget({ playerId, achievementId });
    setEligibleGames([]);
    setNextGameCursor(null);
    setSelectedGameId("");
    setNote("");
    void loadEligibleGames(playerId);
  }

  async function grantAchievement() {
    if (!grantTarget || !selectedGameId) return;
    const key = `${grantTarget.playerId}:${grantTarget.achievementId}`;
    setPending(key);
    setError(undefined);
    try {
      await apiRequest(`/api/v1/pods/${podId}/achievement-grants`, {
        method: "POST",
        body: JSON.stringify({ ...grantTarget, gameId: selectedGameId, notes: note }),
      });
      setGrantTarget(undefined);
      setNote("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Achievement grant failed.");
    } finally {
      setPending(undefined);
    }
  }

  async function revokeAchievement(grant: Grant) {
    const key = `${grant.playerId}:${grant.achievementId}`;
    setPending(key);
    setError(undefined);
    try {
      await apiRequest(`/api/v1/pods/${podId}/achievement-grants`, {
        method: "DELETE",
        body: JSON.stringify({ playerId: grant.playerId, achievementId: grant.achievementId, version: grant.version }),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Achievement revocation failed.");
    } finally {
      setPending(undefined);
    }
  }

  function achievementButton(member: Member, item: Catalog, mobile = false) {
    const key = `${member.id}:${item.id}`;
    const grant = activeGrants.get(key);
    const isEarned = Boolean(grant);
    const disabled = !canEdit || Boolean(item.archivedAt) || pending === key;
    const handleClick = () => grant ? void revokeAchievement(grant) : openGrant(member.id, item.id);

    if (mobile) {
      return <button key={item.id} disabled={disabled} onClick={handleClick} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${isEarned ? "border-emerald-300/20 bg-emerald-300/8" : "border-white/7"}`}>
        <span className={`grid size-7 place-items-center rounded-full ${isEarned ? "bg-emerald-300/15 text-emerald-200" : "bg-white/5 text-stone-700"}`}>{isEarned && <Check className="size-3.5" />}</span>
        <span className="min-w-0"><span className="block text-sm font-semibold">{item.name}{item.archivedAt ? " · archived" : ""}</span><span className="mt-0.5 block text-xs leading-5 text-stone-500">{item.description || "No description provided."}</span>{grant && <span className="mt-1 block text-xs text-emerald-300/80">{earnedDescription(grant)}</span>}</span>
      </button>;
    }

    return <button
      title={grant ? earnedDescription(grant) : undefined}
      disabled={disabled}
      onClick={handleClick}
      aria-label={`${isEarned ? "Revoke" : "Grant"} ${item.name} for ${member.displayName}`}
      className={`grid size-9 place-items-center rounded-full border transition ${isEarned ? "border-emerald-300/25 bg-emerald-300/12 text-emerald-200" : "border-white/10 text-stone-700 hover:border-amber-300/25 hover:text-amber-200"}`}
    >{isEarned ? <Check className="size-4" /> : canEdit && !item.archivedAt ? "·" : <LockKeyhole className="size-3" />}</button>;
  }

  return <div className="grid gap-5">
    <div className="flex gap-2 overflow-x-auto">{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${category === item ? "border-amber-300/30 bg-amber-300/12 text-amber-200" : "border-white/8 text-stone-500 hover:text-white"}`}>{item}</button>)}</div>
    <div className="grid gap-2 sm:grid-cols-3">
      <select aria-label="Filter player" value={player} onChange={(event) => selectPlayer(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-stone-950 px-3 text-sm"><option value="All">All players</option>{members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select>
      <select aria-label="Filter earned status" value={earned} onChange={(event) => setEarned(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-stone-950 px-3 text-sm"><option>All</option><option>Earned</option><option>Unearned</option></select>
      <select aria-label="Filter catalog status" value={catalogState} onChange={(event) => setCatalogState(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-stone-950 px-3 text-sm"><option>Active</option><option>Archived</option><option>All</option></select>
    </div>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    {grantTarget && <Card className="border-amber-300/15 p-5">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[.14em] text-amber-300 uppercase">Game evidence</p><h2 className="font-display mt-1 text-xl">Grant {targetAchievement?.name} to {targetPlayer?.displayName}</h2><p className="mt-1 text-sm text-stone-500">Choose the game where it was earned. That game supplies the achievement date.</p></div><button type="button" onClick={() => setGrantTarget(undefined)} aria-label="Cancel achievement grant" className="text-stone-500 hover:text-white"><X className="size-4" /></button></div>
      <div className="mt-4 grid gap-3">
        <select aria-label="Game where achievement was earned" value={selectedGameId} onChange={(event) => selectEligibleGame(event.target.value)} disabled={loadingGames} className="min-h-11 rounded-xl border border-white/10 bg-stone-950 px-3 text-sm"><option value="">{loadingGames ? "Loading games..." : eligibleGames.length ? "Select a game" : "No eligible games found"}</option>{eligibleGames.map((game) => <option key={game.id} value={game.id}>{gameDescription(game)}</option>)}</select>
        <input aria-label="Optional achievement note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Optional note" className="h-10 rounded-xl border border-white/10 bg-stone-950 px-3 text-sm" />
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={!selectedGameId || loadingGames || Boolean(pending)} onClick={() => void grantAchievement()}>{pending ? "Granting..." : "Grant achievement"}</Button>{nextGameCursor && <Button type="button" variant="secondary" disabled={loadingGames} onClick={() => void loadEligibleGames(grantTarget.playerId, nextGameCursor, true)}>{loadingGames ? "Loading..." : "Load older games"}</Button>}</div>
      </div>
    </Card>}
    <Card className="hidden max-h-[calc(100vh-8rem)] overflow-auto overscroll-contain md:block"><table aria-label="POD achievements by member" className="w-full min-w-[720px] border-collapse text-left"><thead><tr className="border-b border-white/8"><th scope="col" className="sticky top-0 left-0 z-40 min-w-64 bg-stone-950/95 p-4 text-xs tracking-[.14em] text-stone-500 uppercase shadow-[0_1px_0_rgba(255,255,255,.08)] backdrop-blur">Achievement</th>{visibleMembers.map((member) => <th scope="col" key={member.id} className="sticky top-0 z-30 min-w-32 bg-stone-950/95 p-4 text-center text-xs font-semibold text-stone-300 shadow-[0_1px_0_rgba(255,255,255,.08)] backdrop-blur">{member.displayName}</th>)}</tr></thead><tbody>{visible.map((item) => <tr key={item.id} className="border-b border-white/6 last:border-0"><th scope="row" className="sticky left-0 z-10 max-w-80 bg-stone-950 p-4 text-left align-top"><span className="block text-sm font-semibold text-stone-200">{item.name}{item.archivedAt ? " · archived" : ""}</span><span className="mt-1 block text-xs leading-5 font-normal text-stone-500">{item.description || "No description provided."}</span></th>{visibleMembers.map((member) => <td key={member.id} className="p-4 align-top"><div className="flex justify-center">{achievementButton(member, item)}</div></td>)}</tr>)}</tbody></table></Card>
    <div className="grid gap-4 md:hidden">{visibleMembers.map((member) => {
      const isExpanded = expandedMembers.has(member.id);
      const contentId = `member-achievements-${member.id}`;
      const earnedCount = visible.filter((item) => activeGrants.has(`${member.id}:${item.id}`)).length;
      return <Card key={member.id} className="relative">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={() => toggleMember(member.id)}
          className="sticky top-16 z-10 flex w-full items-center gap-3 rounded-2xl bg-stone-950/95 p-4 text-left shadow-[0_1px_0_rgba(255,255,255,.08)] backdrop-blur"
        >
          <ChevronRight aria-hidden="true" className={`size-4 shrink-0 text-stone-500 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          <h2 className="font-display min-w-0 flex-1 truncate text-xl">{member.displayName}</h2>
          <Badge tone="green">{earnedCount} / {visible.length}</Badge>
        </button>
        <div id={contentId} hidden={!isExpanded} className="grid gap-2 px-4 pt-2 pb-4">{visible.map((item) => achievementButton(member, item, true))}</div>
      </Card>;
    })}</div>
  </div>;
}
