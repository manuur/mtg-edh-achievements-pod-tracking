import { LinkButton, PageHeader } from "@/components/ui";
import { AchievementCatalogManager } from "@/components/achievement-catalog-manager";
import { requireUserContext } from "@/lib/auth/server";
import { requireSuperuser } from "@/lib/authorization";
import { listAchievementCategories, listAdminAchievementCatalog } from "@/server/achievements";
import { listAdminGameModes } from "@/server/game-modes";

export default async function AdminAchievementsPage() { const context = await requireUserContext(); requireSuperuser(context); const [catalog, categories, gameModes] = await Promise.all([listAdminAchievementCatalog(context, true), listAchievementCategories(context), listAdminGameModes(context)]); const catalogVersion = `${categories.map((category) => `${category.id}:${category.version}`).join(",")}|${catalog.map((achievement) => `${achievement.id}:${achievement.version}`).join(",")}|${gameModes.map((mode) => `${mode.code}:${mode.version}`).join(",")}`; return <div className="grid gap-7"><PageHeader eyebrow="Superadmin only" title="Achievement catalog" description="Create, edit, organize, automate, archive, restore, import, or permanently delete global achievements." action={<LinkButton href="/admin/users" variant="secondary">User administration</LinkButton>} /><AchievementCatalogManager key={catalogVersion} achievements={catalog} categories={categories} gameModes={gameModes} /></div>; }
