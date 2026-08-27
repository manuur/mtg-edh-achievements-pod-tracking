"use client";

import { useMemo, useState } from "react";
import { useLoadingRouter } from "@/lib/loading-router";
import { Search, ShieldCheck, Trash2, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import type { AdminUserSummary, HardDeletePlayerResult } from "@/server/admin";

export function UserAdminManager({ users }: { users: AdminUserSummary[] }) {
  const router = useLoadingRouter();
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<AdminUserSummary>();
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<HardDeletePlayerResult>();
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) => `${user.displayName} ${user.email ?? ""}`.toLowerCase().includes(normalized));
  }, [query, users]);

  function selectTarget(user: AdminUserSummary) {
    setTarget(user);
    setConfirmation("");
    setError(undefined);
    setResult(undefined);
  }

  async function hardDelete() {
    if (!target) return;
    setPending(true);
    setError(undefined);
    try {
      const deleted = await apiRequest<HardDeletePlayerResult>(`/api/v1/admin/users/${target.id}`, {
        method: "DELETE",
        body: JSON.stringify({ version: target.version, confirmation }),
      });
      setResult(deleted);
      setTarget(undefined);
      setConfirmation("");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "The player could not be permanently deleted.");
    } finally {
      setPending(false);
    }
  }

  return <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-white/8 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Application identities</p><h2 className="font-display mt-1 text-2xl">{users.length} players</h2></div>
        <label className="relative block sm:w-72"><Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-stone-600" /><span className="sr-only">Search players</span><input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search name or email" /></label>
      </div>
      <div className="divide-y divide-white/7">
        {filtered.map((user) => <div key={user.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{user.displayName}</h3>{user.isSuperadmin && <Badge tone="amber">Superadmin</Badge>}{user.claimed ? <Badge tone="green">Google linked</Badge> : <Badge>Unclaimed</Badge>}{user.archivedAt && <Badge tone="red">Archived</Badge>}</div>
            <p className="mt-1 truncate text-sm text-stone-500">{user.email ?? "No claim email"}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500"><span>{user.podCount} PODs</span><span>{user.deckCount} decks</span><span>{user.gameCount} games</span><span>{user.achievementCount} achievements</span></div>
          </div>
          {user.isSuperadmin
            ? <div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><ShieldCheck className="size-4" />Protected singleton</div>
            : <Button type="button" variant="danger" onClick={() => selectTarget(user)}><Trash2 className="size-4" />Hard delete</Button>}
        </div>)}
        {!filtered.length && <div className="p-8 text-center text-sm text-stone-500">No players match that search.</div>}
      </div>
    </Card>

    <div className="h-fit space-y-5">
      {target ? <Card className="border-red-400/20 p-5">
        <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2 text-red-200"><UserRoundX className="size-5" /><h2 className="font-display text-xl">Permanent deletion</h2></div><button type="button" onClick={() => setTarget(undefined)} aria-label="Cancel deletion" className="text-stone-500 hover:text-white"><X className="size-4" /></button></div>
        <p className="mt-4 text-sm leading-6 text-stone-400">This permanently removes <strong className="text-white">{target.displayName}</strong>, their Google authentication account and sessions, {target.gameCount} games they played, {target.deckCount} decks, {target.podCount} memberships, and {target.achievementCount} achievement grants.</p>
        <p className="mt-3 text-xs leading-5 text-amber-200/80">If this player is the final Administrator of a POD, your Superadmin profile takes over that POD before deletion. Shared records they authored are reassigned to you.</p>
        <Field label={<>Type <code className="text-red-200">DELETE {target.displayName}</code> to confirm</>}>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className={`${inputClass} mt-3 border-red-400/20 focus:border-red-300/60 focus:ring-red-300/10`} autoComplete="off" />
        </Field>
        <Button type="button" variant="danger" className="mt-4 w-full" disabled={pending || confirmation !== `DELETE ${target.displayName}`} onClick={hardDelete}>{pending ? "Deleting..." : "Permanently delete player"}</Button>
      </Card> : <Card className="p-5"><div className="flex items-center gap-2 text-emerald-200"><UserRoundCheck className="size-5" /><h2 className="font-display text-xl">Deletion guard</h2></div><p className="mt-3 text-sm leading-6 text-stone-500">Select a player to inspect the exact impact. Your singleton Superadmin identity is protected from application deletion.</p></Card>}
      {result && <Card className="border-emerald-400/20 p-5"><p className="font-semibold text-emerald-200">{result.displayName} was permanently deleted.</p><p className="mt-2 text-xs leading-5 text-stone-500">Removed {result.gamesDeleted} games, {result.decksDeleted} decks, {result.membershipsDeleted} memberships, and {result.grantsDeleted} achievement grants.</p></Card>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  </div>;
}
