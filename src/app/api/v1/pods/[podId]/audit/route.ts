import type { NextRequest } from "next/server";
import { z } from "zod";
import { success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { listAuditEvents } from "@/server/pods";

export const GET = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = z.object({ podId: z.uuid() }).parse(await route.params);
  const limit = z.coerce.number().int().min(1).max(200).default(100).parse(request.nextUrl.searchParams.get("limit") ?? undefined);
  return success(await listAuditEvents(await requireUserContext(), podId, limit));
});
