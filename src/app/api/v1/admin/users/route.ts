import { success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { listAdminUsers } from "@/server/admin";

export const GET = withApi(async () => {
  const context = await requireUserContext();
  return success(await listAdminUsers(context));
});
