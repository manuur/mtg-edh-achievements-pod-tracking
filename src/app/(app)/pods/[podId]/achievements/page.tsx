import { PageHeader } from "@/components/ui";
import { AchievementMatrix } from "@/components/achievement-matrix";
import { requireUserContext } from "@/lib/auth/server";
import { getPod } from "@/server/pods";
import { listPodAchievements } from "@/server/achievements";

export default async function PodAchievementsPage({ params }: { params: Promise<{ podId: string }> }) { const { podId } = await params; const context = await requireUserContext(); const [pod, data] = await Promise.all([getPod(context, podId), listPodAchievements(context, podId)]); return <div className="grid gap-6"><PageHeader title="Achievements" description="A player earns each achievement once in this POD. Grants from other PODs never appear here." /><AchievementMatrix podId={podId} {...data} canEdit={pod.role === "ADMIN" || pod.role === "EDITOR"} /></div>; }
