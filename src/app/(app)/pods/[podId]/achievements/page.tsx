import { PageHeader } from "@/components/ui";
import { AchievementMatrix } from "@/components/achievement-matrix";
import { requireUserContext } from "@/lib/auth/server";
import { getPod } from "@/server/pods";
import { listPodAchievements } from "@/server/achievements";

export default async function PodAchievementsPage({ params }: { params: Promise<{ podId: string }> }) { const { podId } = await params; const context = await requireUserContext(); const [pod, data] = await Promise.all([getPod(context, podId), listPodAchievements(context, podId)]); return <div className="grid gap-6"><PageHeader title="Achievements" description="Each earned achievement is tied to the POD game where it happened, which supplies its date." /><AchievementMatrix podId={podId} timeZone={pod.timezone} {...data} canEdit={pod.role === "ADMIN" || pod.role === "EDITOR"} /></div>; }
