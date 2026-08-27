import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { MetricRangeControls } from "@/components/metric-range-controls";
import { requireUserContext } from "@/lib/auth/server";
import { resolveMetricRange, type MetricRangeQuery } from "@/lib/metric-range";
import { formatPercent } from "@/lib/utils";
import { listDecks } from "@/server/decks";
import { playerMetrics } from "@/server/metrics";
import { getSharedPlayer } from "@/server/profile";

interface PlayerQuery extends MetricRangeQuery { podId?: string }

export default async function PlayerPage({ params, searchParams }: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<PlayerQuery>;
}) {
  const { playerId } = await params;
  const query = await searchParams;
  const range = resolveMetricRange(query);
  const context = await requireUserContext();
  const [player, metrics, decks] = await Promise.all([
    getSharedPlayer(context, playerId, query.podId),
    playerMetrics(context, playerId, query.podId, range.values),
    listDecks(context, playerId, query.podId),
  ]);
  const rankedDecks = [...metrics.deckPerformance].filter((deck) => deck.games >= 3).sort((a, b) => b.win_rate - a.win_rate || b.games - a.games);

  return <div className="grid gap-6">
    <PageHeader
      eyebrow={query.podId ? "POD player" : "Your totals"}
      title={player.displayName}
      description={query.podId ? "Metrics are limited to the shared POD." : "Private totals across all of your PODs."}
      action={<MetricRangeControls query={{ ...query, range: range.key }} preserve={{ podId: query.podId }} />}
    />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Games" value={metrics.games} /><Metric label="Wins" value={metrics.wins} />
      <Metric label="Draws" value={metrics.draws} /><Metric label="Losses" value={metrics.losses} />
      <Metric label="Win rate" value={formatPercent(metrics.win_rate || 0)} />
      <Metric label="Unique opponents" value={metrics.unique_opponents} />
      <Metric label="Participation" value={formatPercent(metrics.participation_share || 0)} />
      <Metric label="Active decks" value={metrics.active_decks} />
    </section>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><Eyebrow tone="violet">Recent form</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Last ten appearances</h2><div className="flex flex-wrap gap-2">{metrics.recentForm.map((result, index) => <Badge key={`${result.played_at}:${index}`} tone={result.result === "W" ? "green" : result.result === "D" ? "neutral" : "red"}>{result.result}</Badge>)}{!metrics.recentForm.length && <p className="text-sm text-stone-500">No appearances in this range.</p>}</div></Card>
      <Card className="p-5"><Eyebrow tone="emerald">Achievements</Eyebrow><h2 className="font-display mt-1 mb-4 text-2xl">Completion</h2><p className="font-display text-4xl">{formatPercent(metrics.achievements.completion)}</p><p className="mt-2 text-xs text-stone-500">{metrics.achievements.earned} earned of {metrics.achievements.available} available</p></Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><Eyebrow tone="amber">Decks</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Most played</h2><DeckPerformanceList rows={metrics.deckPerformance} podId={query.podId} /></Card>
      <Card className="p-5"><Eyebrow tone="violet">Decks</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Best performing</h2><DeckPerformanceList rows={rankedDecks} podId={query.podId} empty="No deck has reached the three-game ranking threshold." /></Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><Eyebrow tone="violet">Historical snapshots</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Bracket distribution</h2><div className="grid gap-3">{[1, 2, 3, 4, 5].map((bracket) => <Distribution key={bracket} label={`Bracket ${bracket}`} value={metrics.brackets.find((row) => row.bracket === bracket)?.appearances ?? 0} max={sumAppearances(metrics.brackets)} />)}</div></Card>
      <Card className="p-5"><Eyebrow tone="amber">Historical snapshots</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Power distribution</h2><div className="grid gap-3">{metrics.powers.map((row) => <Distribution key={row.power} label={Number(row.power).toFixed(1)} value={row.appearances} max={sumAppearances(metrics.powers)} />)}</div>{!metrics.powers.length && <p className="text-sm text-stone-500">No deck snapshots in this range.</p>}</Card>
    </div>

    <Card className="p-5"><Eyebrow tone="violet">Deck library</Eyebrow><h2 className="font-display mt-1 mb-5 text-2xl">Active lineup</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{decks.map(({ deck }) => <Link key={deck.id} href={query.podId ? `/decks/${deck.id}?podId=${query.podId}` : `/decks/${deck.id}`} className="rounded-xl border border-white/8 p-4 hover:border-amber-300/20"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{deck.name}</span><Badge tone="violet">B{deck.bracket}</Badge></div><p className="mt-2 text-xs text-stone-500">{deck.powerLevel === null ? "Power not set" : `Current power ${deck.powerLevel.toFixed(2)}`}</p></Link>)}</div>{!decks.length && <p className="text-sm text-stone-500">No active decks.</p>}</Card>
  </div>;
}

function DeckPerformanceList({ rows, podId, empty = "No deck appearances in this range." }: {
  rows: { deck_id: string; deck_name: string; games: number; wins: number; win_rate: number }[];
  podId?: string;
  empty?: string;
}) {
  if (!rows.length) return <p className="text-sm text-stone-500">{empty}</p>;
  return <div className="grid gap-2">{rows.map((deck) => <Link key={deck.deck_id} href={podId ? `/decks/${deck.deck_id}?podId=${podId}` : `/decks/${deck.deck_id}`} className="flex items-center justify-between rounded-lg p-2 hover:bg-white/4"><div><p className="text-sm font-semibold">{deck.deck_name}</p><p className="text-xs text-stone-500">{deck.games} games · {deck.wins} wins</p></div>{deck.games >= 3 ? <Badge tone="amber">{formatPercent(deck.win_rate)}</Badge> : <Badge>Unranked</Badge>}</Link>)}</div>;
}

function Eyebrow({ children, tone }: { children: React.ReactNode; tone: "amber" | "violet" | "emerald" }) {
  const color = tone === "amber" ? "text-amber-300" : tone === "violet" ? "text-violet-300" : "text-emerald-300";
  return <p className={`text-xs font-bold tracking-[.16em] uppercase ${color}`}>{children}</p>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="font-display text-3xl">{value}</p><p className="mt-1 text-xs text-stone-500">{label}</p></Card>;
}

function sumAppearances(rows: { appearances: number }[]) {
  return rows.reduce((sum, row) => sum + row.appearances, 0);
}

function Distribution({ label, value, max }: { label: string; value: number; max: number }) {
  return <div><div className="mb-1 flex justify-between text-xs"><span className="text-stone-400">{label}</span><span>{value}</span></div><div className="h-2 rounded-full bg-white/6"><div className="h-full rounded-full bg-amber-300/70" style={{ width: `${max ? value / max * 100 : 0}%` }} /></div></div>;
}
