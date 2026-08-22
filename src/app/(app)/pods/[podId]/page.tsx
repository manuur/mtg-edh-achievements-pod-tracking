import { ArrowRight, BookOpen, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { Card, LinkButton } from "@/components/ui";
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
        {gamePage.items.length ? <div className="divide-y divide-white/7">{gamePage.items.map((game) => <Link key={game.id} href={`/pods/${podId}/games/${game.id}`} className="flex items-center justify-between py-3 text-sm hover:text-amber-200"><div><p className="font-medium">{game.resultKind === "DRAW" ? "Table draw" : "Decisive game"}</p><p className="mt-1 text-xs text-stone-500">{formatDate(game.playedAt, pod.timezone)}</p></div><ArrowRight className="size-4" /></Link>)}</div> : <p className="py-10 text-center text-sm text-stone-500">No games recorded yet.</p>}
      </Card>
      <Card className="p-5">
        <p className="text-xs font-bold tracking-[.16em] text-violet-300 uppercase">Leaderboard</p><h2 className="font-display mt-1 text-2xl">Current form</h2>
        <div className="mt-5 grid gap-3">{metrics.leaders.slice(0, 5).map((leader, index) => <div key={leader.player_id} className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-white/6 text-xs font-bold text-stone-400">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{leader.display_name}</p><p className="text-xs text-stone-500">{leader.games} games</p></div><span className="font-display text-lg text-amber-200">{leader.wins}</span></div>)}{!metrics.leaders.length && <p className="py-8 text-center text-sm text-stone-500">Play a game to start the board.</p>}</div>
      </Card>
    </section>
  </div>;
}

function MiniStat({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return <Card className="flex items-center gap-3 p-4"><span className="grid size-10 place-items-center rounded-xl bg-white/6 text-amber-200 [&>svg]:size-4">{icon}</span><div><p className="font-display text-2xl">{value}</p><p className="text-xs text-stone-500">{label}</p></div></Card>;
}
