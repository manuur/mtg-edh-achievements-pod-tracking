import { ExternalLink } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { DeckForm } from "@/components/forms/deck-form";
import { MetricRangeControls } from "@/components/metric-range-controls";
import { requireUserContext } from "@/lib/auth/server";
import { resolveMetricRange, type MetricRangeQuery } from "@/lib/metric-range";
import { formatPercent } from "@/lib/utils";
import { canManageDeck, getDeck } from "@/server/decks";
import { deckMetrics } from "@/server/metrics";

interface DeckQuery extends MetricRangeQuery { podId?: string }

export default async function DeckDetailPage({ params, searchParams }: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<DeckQuery>;
}) {
  const { deckId } = await params;
  const query = await searchParams;
  const range = resolveMetricRange(query);
  const context = await requireUserContext();
  const [deck, metrics, canManage] = await Promise.all([
    getDeck(context, deckId, query.podId),
    deckMetrics(context, deckId, query.podId, range.values),
    canManageDeck(context, deckId),
  ]);

  return <div className="grid gap-6">
    <PageHeader
      eyebrow="Deck profile"
      title={deck.name}
      description="Current settings are separate from immutable snapshots on past games."
      action={<div className="flex flex-wrap gap-2"><MetricRangeControls query={{ ...query, range: range.key }} preserve={{ podId: query.podId }} />{deck.moxfieldUrl && <a href={deck.moxfieldUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 self-end rounded-xl bg-amber-300 px-4 text-sm font-semibold text-[var(--button-primary-text)]">Open Moxfield <ExternalLink className="size-4" /></a>}</div>}
    />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Metric label="Games" value={metrics?.games ?? 0} /><Metric label="Wins" value={metrics?.wins ?? 0} />
      <Metric label="Draws" value={metrics?.draws ?? 0} /><Metric label="Losses" value={metrics?.losses ?? 0} />
      <Metric label="Win rate" value={formatPercent(metrics?.win_rate ?? 0)} />
    </section>

    <div className={`grid gap-6 ${canManage ? "lg:grid-cols-[1fr_360px]" : ""}`}>
      <Card className="p-6"><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Current deck</p><div className="mt-3 flex flex-wrap items-center gap-3"><Badge tone={deck.bracket >= 4 ? "red" : deck.bracket === 3 ? "violet" : "green"}>Bracket {deck.bracket}</Badge><Badge tone={deck.powerLevel === null ? "neutral" : "amber"}>{deck.powerLevel === null ? "Power not set" : `Power ${deck.powerLevel.toFixed(2)}`}</Badge>{deck.archivedAt && <Badge>Archived</Badge>}</div><p className="mt-5 text-sm leading-6 text-stone-400">Historical analytics use the bracket and any power level captured when each game was recorded. Editing this deck never rewrites those snapshots.</p>{metrics?.last_played && <p className="mt-4 text-xs text-stone-500">Last played {new Date(metrics.last_played).toLocaleDateString()}</p>}</Card>
      {canManage && <Card className="p-5"><h2 className="font-display mb-5 text-xl">Maintain deck</h2><DeckForm ownerPlayerId={deck.ownerPlayerId} existing={deck} /></Card>}
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><p className="text-xs font-bold tracking-[.16em] text-violet-300 uppercase">Recent form</p><h2 className="font-display mt-1 mb-5 text-2xl">Last ten games</h2><div className="flex flex-wrap gap-2">{metrics?.recentForm.map((result, index) => <Badge key={`${result.played_at}:${index}`} tone={result.result === "W" ? "green" : result.result === "D" ? "neutral" : "red"}>{result.result}</Badge>)}{!metrics?.recentForm.length && <p className="text-sm text-stone-500">No games in this range.</p>}</div></Card>
      <Card className="p-5"><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Historical snapshots</p><h2 className="font-display mt-1 mb-5 text-2xl">Bracket and power</h2><div className="grid gap-3">{metrics?.snapshotDistribution.map((row) => <div key={`${row.bracket}:${row.power_level ?? "unset"}`} className="flex items-center justify-between rounded-xl border border-white/7 p-3"><div className="flex gap-2"><Badge tone="violet">Bracket {row.bracket}</Badge><Badge tone={row.power_level === null ? "neutral" : "amber"}>{row.power_level === null ? "Power not set" : `Power ${Number(row.power_level).toFixed(2)}`}</Badge></div><span className="text-xs text-stone-400">{row.appearances} {row.appearances === 1 ? "game" : "games"}</span></div>)}{!metrics?.snapshotDistribution.length && <p className="text-sm text-stone-500">No historical snapshots in this range.</p>}</div></Card>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card className="p-4"><p className="font-display text-3xl">{value}</p><p className="mt-1 text-xs text-stone-500">{label}</p></Card>;
}
