import { Card, PageHeader } from "@/components/ui";
import { PodSettingsForm } from "@/components/forms/pod-settings-form";
import { AppError } from "@/lib/errors";
import { requireUserContext } from "@/lib/auth/server";
import { getPod, listAuditEvents } from "@/server/pods";
import { formatDate } from "@/lib/utils";

export default async function PodSettingsPage({ params }: { params: Promise<{ podId: string }> }) {
  const { podId } = await params;
  const context = await requireUserContext();
  const pod = await getPod(context, podId, true);
  if (pod.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Administrator access is required.");
  const audit = await listAuditEvents(context, podId, 50);
  return <div className="grid max-w-4xl gap-6"><PageHeader eyebrow="Administration" title="POD settings" description="Identity, archival controls, and immutable activity history for this private table." /><div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]"><Card className="h-fit p-5 sm:p-7"><PodSettingsForm pod={pod} /></Card><Card className="overflow-hidden"><div className="border-b border-white/8 p-5"><h2 className="font-display text-xl">Audit history</h2><p className="mt-1 text-xs text-stone-500">The latest 50 sensitive events.</p></div><div className="max-h-[620px] divide-y divide-white/7 overflow-auto">{audit.map((event) => <div key={event.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{event.action.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-stone-500">{event.actorName ?? "System"} · {event.entityType}</p></div><time className="shrink-0 text-[10px] text-stone-600">{formatDate(event.createdAt, pod.timezone)}</time></div></div>)}{!audit.length && <p className="p-8 text-center text-sm text-stone-500">No events yet.</p>}</div></Card></div></div>;
}
