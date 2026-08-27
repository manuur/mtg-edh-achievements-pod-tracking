import { ArrowRight, ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { DeckSummaryStats } from "@/components/deck-summary-stats";
import { DeckForm } from "@/components/forms/deck-form";
import { requireUserContext } from "@/lib/auth/server";
import { listDecks } from "@/server/decks";
import { ownedDeckSummaries } from "@/server/metrics";

export default async function DecksPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const context = await requireUserContext();
  const includeArchived = (await searchParams).archived === "true";
  const [deckRows, summaries] = await Promise.all([
    listDecks(context, undefined, undefined, includeArchived),
    ownedDeckSummaries(context),
  ]);
  const summariesByDeckId = new Map(summaries.map((summary) => [summary.deck_id, summary]));
  return <div className="grid gap-8"><PageHeader eyebrow="Your arsenal" title="Decks" description="One deck profile follows you across every POD while game snapshots preserve its history." action={<LinkButton href={includeArchived ? "/decks" : "/decks?archived=true"} variant="secondary">{includeArchived ? "Active only" : "Include archived"}</LinkButton>} />
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]"><section>{deckRows.length ? <div className="grid gap-3 sm:grid-cols-2">{deckRows.map(({ deck }) => <Card key={deck.id} className="p-5"><div className="flex items-start justify-between"><div><div className="flex items-center gap-2"><h2 className="font-display text-xl">{deck.name}</h2>{deck.archivedAt && <Badge>Archived</Badge>}</div><p className="mt-1 text-xs text-stone-500">{deck.powerLevel === null ? "Power not set" : `Power ${deck.powerLevel.toFixed(2)} / 10`}</p></div><Badge tone={deck.bracket >= 4 ? "red" : deck.bracket === 3 ? "violet" : "green"}>Bracket {deck.bracket}</Badge></div><DeckSummaryStats summary={summariesByDeckId.get(deck.id)} /><div className="mt-4 flex items-center justify-between">{deck.moxfieldUrl ? <a href={deck.moxfieldUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200 hover:text-amber-100">Open Moxfield <ExternalLink className="size-3" /></a> : <span />}<Link href={`/decks/${deck.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-stone-400 hover:text-white">Details <ArrowRight className="size-3" /></Link></div></Card>)}</div> : <EmptyState title="No decks yet" description="Add the first deck you want to track across your games." />}</section><Card className="h-fit p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-amber-300/10 text-amber-200"><Plus className="size-4" /></span><div><h2 className="font-display text-xl">Add a deck</h2><p className="text-xs text-stone-500">Only the fields that affect tracking.</p></div></div><DeckForm ownerPlayerId={context.player.id} /></Card></div>
  </div>;
}
