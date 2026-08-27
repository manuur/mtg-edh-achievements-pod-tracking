import { ArrowRight, BookOpen, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { GameAchievementBadges } from "@/components/game-achievement-badges";
import { Card, LinkButton } from "@/components/ui";
import { PodLeaderboard } from "@/components/pod-leaderboard";
import { requireUserContext } from "@/lib/auth/server";
import { formatDate } from "@/lib/utils";
import { listGames } from "@/server/games";
import { podMetrics } from "@/server/metrics";
import { getPod } from "@/server/pods";

export default async function PodOverviewPage({ params }: { params: Promise<{ podId: string }> }) {
  const { podId } = await params;
  const context = await requireUserContext();
  const [pod, gamePage, metrics] = await Promise.all([
    getPod(context, podId),
    listGames(context, podId, { limit: 5 }),
    podMetrics(context, podId),
  ]);
  const canRecord = pod.role === "ADMIN" || pod.role === "EDITOR";

  return <div className="grid gap-7">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MiniStat icon={<Swords />} value={metrics.summary.games} label="Games" />
      <MiniStat icon={<Users />} value={metrics.summary.active_players} label="Players" />
      <MiniStat icon={<BookOpen />} value={metrics.summary.active_decks} label="Played decks" />
      <MiniStat icon={<Trophy />} value={Math.max(0, ...metrics.leaders.map((leader) => leader.wins))} label="Leading wins" />
    </section>
    <section className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <Card className="p-5">
        <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Latest results</p><h2 className="font-display mt-1 text-2xl">Recent games</h2></div>{canRecord && <LinkButton href={`/pods/${podId}/games/new`}>Record game</LinkButton>}</div>
        {gamePage.items.length ? <div className="divide-y divide-white/7">{gamePage.items.map((game) => <Link key={game.id} href={`/pods/${podId}/games/${game.id}`} className="group flex items-center gap-4 py-4 text-sm"><span className={`grid size-10 shrink-0 place-items-center rounded-xl font-display text-base ${game.resultKind === "DRAW" ? "bg-white/6 text-stone-300" : "bg-emerald-300/10 text-emerald-200"}`}>{game.resultKind === "DRAW" ? "=" : "W"}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold text-stone-100 transition group-hover:text-amber-200">{game.resultKind === "DRAW" ? "Table draw" : `${game.winnerName ?? "Unknown player"} won${game.winnerDeckName ? ` with ${game.winnerDeckName}` : ""}`}</p><p className="mt-1 text-xs text-stone-500">{formatDate(game.playedAt, pod.timezone)} · {game.participantCount} {game.participantCount === 1 ? "player" : "players"}</p>{game.notes && <p className="mt-1 truncate text-xs text-stone-400">{game.notes}</p>}<GameAchievementBadges achievements={game.achievements} /></div><ArrowRight className="size-4 shrink-0 text-stone-600 transition group-hover:translate-x-0.5 group-hover:text-amber-200" /></Link>)}</div> : <p className="py-10 text-center text-sm text-stone-500">No games recorded yet.</p>}
      </Card>
      <Card className="p-5"><PodLeaderboard podId={podId} leaders={metrics.leaders} achievementLeaders={metrics.achievementLeaders} /></Card>
    </section>
  </div>;
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return <Card className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-white/6 text-amber-200 [&>svg]:size-4">{icon}</span><div><p className="font-display text-2xl">{value}</p><p className="text-xs text-stone-500">{label}</p></div></Card>;
}
