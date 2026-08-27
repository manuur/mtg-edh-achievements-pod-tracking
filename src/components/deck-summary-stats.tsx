import type { OwnedDeckSummary } from "@/server/metrics";
import { formatDate, formatPercent } from "@/lib/utils";

export function DeckSummaryStats({ summary }: { summary?: OwnedDeckSummary }) {
  const games = summary?.games ?? 0;
  const wins = summary?.wins ?? 0;
  const draws = summary?.draws ?? 0;
  const losses = summary?.losses ?? 0;

  return <div className="mt-5">
    <div aria-label="All-time deck performance" className="grid grid-cols-3 divide-x divide-white/7 rounded-xl border border-white/7 bg-black/10 py-3 text-center">
      <DeckStat label="Games" value={games} />
      <DeckStat label="Record" value={`${wins}W · ${draws}D · ${losses}L`} compact />
      <DeckStat label="Win rate" value={formatPercent(summary?.win_rate ?? 0)} />
    </div>
    <p className="mt-2 text-[11px] text-stone-600">{summary?.last_played ? `Last played ${formatDate(summary.last_played, summary.last_played_timezone ?? "UTC")}` : "Never played"} · all PODs</p>
  </div>;
}

function DeckStat({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return <div className="min-w-0 px-2"><p className={`font-display truncate text-amber-100 ${compact ? "text-sm" : "text-lg"}`}>{value}</p><p className="mt-0.5 text-[9px] font-bold tracking-[.12em] text-stone-600 uppercase">{label}</p></div>;
}
