import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActivityChart } from "@/components/metrics-chart";
import { MetricRangeControls } from "@/components/metric-range-controls";
import { requireUserContext } from "@/lib/auth/server";
import { resolveMetricRange, type MetricRangeQuery } from "@/lib/metric-range";
import { formatPercent } from "@/lib/utils";
import { podMetrics } from "@/server/metrics";

export default async function PodMetricsPage({ params, searchParams }: {
  params: Promise<{ podId: string }>;
  searchParams: Promise<MetricRangeQuery>;
}) {
  const { podId } = await params;
  const query = await searchParams;
  const range = resolveMetricRange(query);
  const metrics = await podMetrics(await requireUserContext(), podId, range.values);
  const mostPlayedPlayers = [...metrics.leaders].sort((a, b) => b.games - a.games || a.display_name.localeCompare(b.display_name));
  const bestPlayers = [...metrics.leaders].filter((player) => player.games >= 3).sort((a, b) => b.win_rate - a.win_rate || b.games - a.games);
  const mostPlayedDecks = [...metrics.deckLeaders].sort((a, b) => b.games - a.games || a.deck_name.localeCompare(b.deck_name));
  const bestDecks = [...metrics.deckLeaders].filter((deck) => deck.games >= 3).sort((a, b) => b.win_rate - a.win_rate || b.games - a.games);

  return <div className="grid gap-6">
    <PageHeader
      title="POD metrics"
      description="Results update immediately when a game is recorded, edited, archived, or restored. Win-rate rankings require three games."
      action={<MetricRangeControls query={{ ...query, range: range.key }} />}
    />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric value={metrics.summary.games} label="Games" />
      <Metric value={metrics.summary.recent_games} label="Last 30 days" />
      <Metric value={metrics.summary.active_players} label="Active players" />
      <Metric value={metrics.summary.active_decks} label="Played decks" />
      <Metric value={Number(metrics.summary.average_table_size).toFixed(1)} label="Average table" />
    </section>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <Eyebrow tone="amber">Activity</Eyebrow>
        <h2 className="font-display mt-1 mb-5 text-2xl">Games by month</h2>
        <ActivityChart data={metrics.activity} caption="Games by month" />
      </Card>
      <Card className="p-5">
        <Eyebrow tone="violet">Activity</Eyebrow>
        <h2 className="font-display mt-1 mb-5 text-2xl">Games by week</h2>
        <ActivityChart data={metrics.activityByWeek} caption="Games by week" />
      </Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><Eyebrow tone="violet">Players</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Most played</h2><div className="grid gap-3">{mostPlayedPlayers.slice(0, 10).map((player, index) => <Link href={`/players/${player.player_id}?podId=${podId}`} key={player.player_id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg p-1 hover:bg-white/4"><span className="text-xs text-stone-600">{index + 1}</span><div><p className="text-sm font-semibold">{player.display_name}</p><p className="text-xs text-stone-500">{player.games} games · {formatPercent(player.participation_share)} participation</p></div><Badge>{player.wins} wins</Badge></Link>)}</div></Card>
      <Card className="p-5"><Eyebrow tone="violet">Players</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Best performing</h2><div className="grid gap-3">{bestPlayers.slice(0, 10).map((player, index) => <Link href={`/players/${player.player_id}?podId=${podId}`} key={player.player_id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg p-1 hover:bg-white/4"><span className="text-xs text-stone-600">{index + 1}</span><div><p className="text-sm font-semibold">{player.display_name}</p><p className="text-xs text-stone-500">{player.games} games · {player.wins} wins</p></div><Badge tone="amber">{formatPercent(player.win_rate || 0)}</Badge></Link>)}{!bestPlayers.length && <p className="text-sm text-stone-500">No player has reached three games.</p>}</div></Card>
      <Card className="p-5"><Eyebrow tone="amber">Decks</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Most played</h2><div className="grid gap-3">{mostPlayedDecks.slice(0, 10).map((deck, index) => <Link href={`/decks/${deck.deck_id}?podId=${podId}`} key={deck.deck_id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg p-2 hover:bg-white/4"><span className="text-xs text-stone-600">{index + 1}</span><div><p className="text-sm font-semibold">{deck.deck_name}</p><p className="text-xs text-stone-500">{deck.owner_name} · {deck.games} games</p></div><Badge>{deck.wins} wins</Badge></Link>)}</div></Card>
      <Card className="p-5"><Eyebrow tone="amber">Decks</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Best performing</h2><div className="grid gap-3">{bestDecks.slice(0, 10).map((deck, index) => <Link href={`/decks/${deck.deck_id}?podId=${podId}`} key={deck.deck_id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg p-2 hover:bg-white/4"><span className="text-xs text-stone-600">{index + 1}</span><div><p className="text-sm font-semibold">{deck.deck_name}</p><p className="text-xs text-stone-500">{deck.owner_name} · {deck.games} games</p></div><Badge tone="violet">{formatPercent(deck.win_rate)}</Badge></Link>)}{!bestDecks.length && <p className="text-sm text-stone-500">No deck has reached three games.</p>}</div></Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-5">
        <Eyebrow tone="emerald">Achievements</Eyebrow>
        <h2 className="font-display mt-1 mb-5 text-2xl">Completion leaders</h2>
        <div className="grid gap-3">{metrics.achievementLeaders.map((player) => <div key={player.player_id}>
          <div className="mb-1 flex items-center justify-between text-sm"><span className="font-semibold">{player.display_name}</span><span className="text-stone-400">{player.earned}/{player.available}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-white/6"><div className="h-full rounded-full bg-emerald-300/70" style={{ width: `${Math.min(100, player.completion * 100)}%` }} /></div>
        </div>)}</div>
      </Card>
      <Card className="p-5">
        <Eyebrow tone="violet">Power profile</Eyebrow>
        <h2 className="font-display mt-1 mb-5 text-2xl">Bracket distribution</h2>
        <div className="grid gap-3">{[1, 2, 3, 4, 5].map((bracket) => {
          const appearances = metrics.brackets.find((row) => row.bracket === bracket)?.appearances ?? 0;
          return <Distribution key={bracket} label={`Bracket ${bracket}`} value={appearances} max={sumAppearances(metrics.brackets)} />;
        })}</div>
      </Card>
      <Card className="p-5">
        <Eyebrow tone="amber">Power profile</Eyebrow>
        <h2 className="font-display mt-1 mb-5 text-2xl">Power distribution</h2>
        <div className="grid gap-3">{metrics.powers.map((row) => <Distribution key={row.bucket} label={`${row.bucket}.0–${row.bucket === 10 ? "10.0" : `${row.bucket}.99`}`} value={row.appearances} max={sumAppearances(metrics.powers)} />)}</div>
      </Card>
    </div>

    <EncounterMatrix players={metrics.leaders.map((player) => ({ id: player.player_id, name: player.display_name }))} encounters={metrics.encounters} />
  </div>;
}

function EncounterMatrix({ players, encounters }: {
  players: { id: string; name: string }[];
  encounters: { player_a_id: string; player_b_id: string; games: number }[];
}) {
  const lookup = new Map(encounters.map((row) => [`${row.player_a_id}:${row.player_b_id}`, row.games]));
  const gamesTogether = (first: string, second: string) => lookup.get(first < second ? `${first}:${second}` : `${second}:${first}`) ?? 0;
  return <Card className="p-5">
    <Eyebrow tone="amber">Matchups</Eyebrow>
    <h2 className="font-display mt-1 mb-5 text-2xl">Opponent encounter matrix</h2>
    <div className="overflow-auto"><table className="min-w-full border-separate border-spacing-1 text-center text-xs">
      <caption className="sr-only">Number of games each pair of players appeared in together</caption>
      <thead><tr><th className="sticky left-0 bg-stone-950 p-2 text-left">Player</th>{players.map((player) => <th key={player.id} className="max-w-24 truncate p-2 font-medium text-stone-400" title={player.name}>{player.name}</th>)}</tr></thead>
      <tbody>{players.map((rowPlayer) => <tr key={rowPlayer.id}><th className="sticky left-0 bg-stone-950 p-2 text-left font-medium">{rowPlayer.name}</th>{players.map((columnPlayer) => <td key={columnPlayer.id} className="rounded-lg bg-white/4 p-2 text-stone-300">{rowPlayer.id === columnPlayer.id ? "—" : gamesTogether(rowPlayer.id, columnPlayer.id)}</td>)}</tr>)}</tbody>
    </table></div>
    {!players.length && <p className="text-sm text-stone-500">Record a game to build the encounter matrix.</p>}
  </Card>;
}

function Eyebrow({ children, tone }: { children: React.ReactNode; tone: "amber" | "violet" | "emerald" }) {
  const color = tone === "amber" ? "text-amber-300" : tone === "violet" ? "text-violet-300" : "text-emerald-300";
  return <p className={`text-xs font-bold tracking-[.16em] uppercase ${color}`}>{children}</p>;
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <Card className="p-4"><p className="font-display text-3xl">{value}</p><p className="mt-1 text-xs text-stone-500">{label}</p></Card>;
}

function sumAppearances(rows: { appearances: number }[]) {
  return rows.reduce((sum, row) => sum + row.appearances, 0);
}

function Distribution({ label, value, max }: { label: string; value: number; max: number }) {
  return <div><div className="mb-1 flex justify-between text-xs"><span className="text-stone-400">{label}</span><span>{value}</span></div><div className="h-2 rounded-full bg-white/6"><div className="h-full rounded-full bg-violet-300/70" style={{ width: `${max ? value / max * 100 : 0}%` }} /></div></div>;
}
