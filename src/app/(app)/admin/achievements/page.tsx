import { LinkButton, PageHeader } from "@/components/ui";
import { AchievementCatalogManager } from "@/components/achievement-catalog-manager";
import { requireUserContext } from "@/lib/auth/server";
import { requireSuperuser } from "@/lib/authorization";
import { listCatalog } from "@/server/achievements";

export default async function AdminAchievementsPage() { const context = await requireUserContext(); requireSuperuser(context); const catalog = await listCatalog(context, true); return <div className="grid gap-7"><PageHeader eyebrow="Superadmin only" title="Achievement catalog" description="Create, edit, archive, restore, import, or permanently delete global achievements." action={<LinkButton href="/admin/users" variant="secondary">User administration</LinkButton>} /><AchievementCatalogManager achievements={catalog} /></div>; }
