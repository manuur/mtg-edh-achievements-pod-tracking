import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { GameAchievementBadges } from "@/components/game-achievement-badges";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireUserContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/utils";
import { listGames } from "@/server/games";
import { getPod } from "@/server/pods";
import { gameResultTitle } from "@/lib/game-results";

export default async function GamesPage({ params, searchParams }: {
  params: Promise<{ podId: string }>;
  searchParams: Promise<{ archived?: string; cursor?: string }>;
}) {
  const { podId } = await params;
  const query = await searchParams;
  const context = await requireUserContext();
  const pod = await getPod(context, podId);
  const includeArchived = pod.role === "ADMIN" && query.archived === "true";
  const page = await listGames(context, podId, { includeArchived, cursor: query.cursor });
  const canEdit = pod.role === "ADMIN" || pod.role === "EDITOR";
  const action = <div className="flex flex-wrap gap-2">
    {pod.role === "ADMIN" && <LinkButton href={includeArchived ? `/pods/${podId}/games` : `/pods/${podId}/games?archived=true`} variant="secondary">{includeArchived ? "Active only" : "Include archived"}</LinkButton>}
    {canEdit && <LinkButton href={`/pods/${podId}/games/new`}><Plus className="size-4" /> Record game</LinkButton>}
  </div>;

  return <div className="grid gap-6">
    <PageHeader title="Game history" description="Every result keeps deck snapshots so later deck changes never rewrite the table’s past." action={action} />
    {page.items.length ? <>
      <Card className="divide-y divide-white/7 overflow-hidden">{page.items.map((game) => <Link key={game.id} href={`/pods/${podId}/games/${game.id}`} className="flex min-w-0 items-center gap-3 p-4 transition hover:bg-white/4 sm:gap-4 sm:p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/6 font-display text-lg text-amber-200">{game.resultKind === "DRAW" ? "=" : "W"}</span>
        <div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><p className="min-w-0 break-words font-semibold">{gameResultTitle(game.resultKind, game.winners)}</p><Badge tone={game.resultKind === "DRAW" ? "neutral" : "green"}>{game.resultKind}</Badge><Badge tone="violet">{game.gameModeName}</Badge>{game.archivedAt && <Badge>Archived</Badge>}</div><p className="mt-1 break-words text-xs text-stone-500">{formatDate(game.playedAt, pod.timezone)} · {game.participantCount} {game.participantCount === 1 ? "player" : "players"}{game.notes ? ` · ${game.notes}` : ""}</p><GameAchievementBadges achievements={game.achievements} /></div>
        <ArrowRight aria-hidden="true" className="hidden size-4 shrink-0 text-stone-600 sm:block" />
      </Link>)}</Card>
      {page.nextCursor && <div className="flex justify-center"><LinkButton variant="secondary" href={`/pods/${podId}/games?${new URLSearchParams({ ...(includeArchived ? { archived: "true" } : {}), cursor: page.nextCursor }).toString()}`}>Older games</LinkButton></div>}
    </> : <EmptyState title="No games recorded" description={canEdit ? "Record your first result and the POD metrics will appear immediately." : "An Editor or Administrator can record the first result."} action={canEdit ? <LinkButton href={`/pods/${podId}/games/new`}>Record game</LinkButton> : undefined} />}
  </div>;
}
