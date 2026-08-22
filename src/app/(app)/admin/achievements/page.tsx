import { PageHeader } from "@/components/ui";
import { AchievementCatalogManager } from "@/components/achievement-catalog-manager";
import { requireUserContext } from "@/lib/auth/server";
import { requireSuperuser } from "@/lib/authorization";
import { listCatalog } from "@/server/achievements";

export default async function AdminAchievementsPage() { const context = await requireUserContext(); requireSuperuser(context); const catalog = await listCatalog(context, true); return <div className="grid gap-7"><PageHeader eyebrow="Superuser only" title="Achievement catalog" description="This global list is available to every POD. Archival preserves historical grants." /><AchievementCatalogManager achievements={catalog} /></div>; }
