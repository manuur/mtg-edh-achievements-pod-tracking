import { GameModeCatalogManager } from "@/components/game-mode-catalog-manager";
import { LinkButton, PageHeader } from "@/components/ui";
import { requireSuperuser } from "@/lib/authorization";
import { requireUserContext } from "@/lib/auth/server";
import { listAdminGameModes } from "@/server/game-modes";
import { listCatalog } from "@/server/achievements";

export default async function AdminGameModesPage() {
  const context = await requireUserContext();
  requireSuperuser(context);
  const [gameModes, achievements] = await Promise.all([listAdminGameModes(context), listCatalog(context, true)]);
  const catalogVersion = gameModes.map((mode) => `${mode.code}:${mode.version}`).join(",");
  return <div className="grid gap-7"><PageHeader eyebrow="Superadmin only" title="Game modes" description="Create generic modes, edit catalog copy, and archive or restore modes without rewriting game history." action={<LinkButton href="/admin/achievements" variant="secondary">Achievement catalog</LinkButton>} /><GameModeCatalogManager key={catalogVersion} gameModes={gameModes} achievements={achievements} /></div>;
}
