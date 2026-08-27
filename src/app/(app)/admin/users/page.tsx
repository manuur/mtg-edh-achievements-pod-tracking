import { LinkButton, PageHeader } from "@/components/ui";
import { UserAdminManager } from "@/components/user-admin-manager";
import { requireSuperuser } from "@/lib/authorization";
import { requireUserContext } from "@/lib/auth/server";
import { listAdminUsers } from "@/server/admin";

export default async function AdminUsersPage() {
  const context = await requireUserContext();
  requireSuperuser(context);
  const users = await listAdminUsers(context);
  return <div className="grid gap-7">
    <PageHeader eyebrow="Superadmin only" title="User administration" description="Inspect every application player and permanently purge an identity with its dependent personal records." action={<LinkButton href="/admin/achievements" variant="secondary">Achievement catalog</LinkButton>} />
    <UserAdminManager users={users} />
  </div>;
}
