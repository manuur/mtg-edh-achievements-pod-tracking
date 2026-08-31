import { Badge } from "@/components/ui";
import { PodTabs } from "@/components/pod-tabs";
import { requireUserContext } from "@/lib/auth/server";
import { getPod } from "@/server/pods";

export default async function PodLayout({ children, params }: { children: React.ReactNode; params: Promise<{ podId: string }> }) {
  const { podId } = await params;
  const pod = await getPod(await requireUserContext(), podId, true);
  return <div className="grid min-w-0 gap-7">
    <header className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-3">
          <Badge tone={pod.role === "ADMIN" ? "amber" : pod.role === "EDITOR" ? "violet" : "neutral"}>{pod.role}</Badge>
          {pod.archivedAt && <Badge>Archived</Badge>}
          <span className="min-w-0 break-words text-xs text-stone-500">{pod.timezone.replaceAll("_", " ")}</span>
        </div>
        <h1 className="font-display break-words text-4xl tracking-tight">{pod.name}</h1>
      </div>
      <PodTabs podId={podId} isAdmin={pod.role === "ADMIN"} />
    </header>
    <div className="min-w-0">{children}</div>
  </div>;
}
