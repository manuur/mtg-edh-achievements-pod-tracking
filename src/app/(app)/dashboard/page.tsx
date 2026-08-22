import { ArrowRight, BookOpen, Plus, Swords, Trophy, Users } from "lucide-react";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { requireUserContext } from "@/lib/auth/server";
import { formatPercent } from "@/lib/utils";
import { listPods } from "@/server/pods";
import { playerMetrics } from "@/server/metrics";

export default async function DashboardPage() {
  const context = await requireUserContext();
  const [allPods, metrics] = await Promise.all([listPods(context, true), playerMetrics(context, context.player.id)]);
  const pods = allPods.filter((pod) => !pod.archivedAt);
  const archivedPods = allPods.filter((pod) => pod.archivedAt && pod.role === "ADMIN");
  return <div className="grid gap-10"><PageHeader eyebrow="Personal command center" title={`Good to see you, ${context.player.displayName}.`} description="Your playgroups, recent form, and next game are all in one place." action={<LinkButton href="/pods/new"><Plus className="size-4" /> New POD</LinkButton>} />
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat icon={<Swords />} value={metrics.games} label="Games played" /><Stat icon={<Trophy />} value={metrics.wins} label="Wins" /><Stat icon={<Users />} value={metrics.unique_opponents} label="Opponents" /><Stat icon={<BookOpen />} value={formatPercent(metrics.win_rate || 0)} label="Win rate" /></section>
    <section id="pods"><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold tracking-[.18em] text-amber-300 uppercase">Your tables</p><h2 className="font-display mt-1 text-2xl">PODs</h2></div><LinkButton href="/pods/new" variant="ghost">Create POD</LinkButton></div>{pods.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{pods.map((pod) => <Card key={pod.id} className="group p-5 transition hover:-translate-y-0.5 hover:border-amber-300/20"><div className="flex items-start justify-between"><span className="grid size-11 place-items-center rounded-xl bg-violet-400/12 font-display text-xl text-violet-200">{pod.name[0]}</span><Badge tone={pod.role === "ADMIN" ? "amber" : pod.role === "EDITOR" ? "violet" : "neutral"}>{pod.role}</Badge></div><h3 className="font-display mt-6 text-2xl">{pod.name}</h3><p className="mt-1 text-sm text-stone-500">{pod.timezone.replaceAll("_", " ")}</p><Link href={`/pods/${pod.id}`} className="mt-6 flex items-center justify-between border-t border-white/7 pt-4 text-sm font-semibold text-stone-300 group-hover:text-amber-200">Open table <ArrowRight className="size-4" /></Link></Card>)}</div> : <EmptyState title="Create your first POD" description="A POD is a private table for members, games, achievements, and shared analytics." action={<LinkButton href="/pods/new">Create POD</LinkButton>} />}</section>
    {archivedPods.length > 0 && <section><h2 className="mb-3 text-sm font-semibold text-stone-500">Archived PODs</h2><div className="flex flex-wrap gap-2">{archivedPods.map((pod) => <Link key={pod.id} href={`/pods/${pod.id}/settings`} className="rounded-xl border border-white/8 px-3 py-2 text-sm text-stone-400 hover:text-white">{pod.name} · restore</Link>)}</div></section>}
  </div>;
}

import Link from "next/link";
function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) { return <Card className="p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-white/6 text-amber-200 [&>svg]:size-4">{icon}</span><div><p className="font-display text-2xl text-white">{value}</p><p className="text-xs text-stone-500">{label}</p></div></div></Card>; }
