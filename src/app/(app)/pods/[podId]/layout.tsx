import { Badge } from "@/components/ui";
import { PodTabs } from "@/components/pod-tabs";
import { requireUserContext } from "@/lib/auth/server";
import { getPod } from "@/server/pods";

export default async function PodLayout({ children, params }: { children: React.ReactNode; params: Promise<{ podId: string }> }) {
  const { podId } = await params;
  const pod = await getPod(await requireUserContext(), podId, true);
  return <div className="grid gap-7"><header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 flex items-center gap-3"><Badge tone={pod.role === "ADMIN" ? "amber" : pod.role === "EDITOR" ? "violet" : "neutral"}>{pod.role}</Badge>{pod.archivedAt && <Badge>Archived</Badge>}<span className="text-xs text-stone-500">{pod.timezone.replaceAll("_", " ")}</span></div><h1 className="font-display text-4xl tracking-tight">{pod.name}</h1></div><PodTabs podId={podId} isAdmin={pod.role === "ADMIN"} /></header>{children}</div>;
}
