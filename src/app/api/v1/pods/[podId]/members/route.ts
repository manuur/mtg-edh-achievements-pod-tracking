import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { addMemberSchema } from "@/lib/validation";
import { addMember, listMembers } from "@/server/pods";

const paramsSchema = z.object({ podId: z.uuid() });

export const GET = withApi<{ podId: string }>(async (_request, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  return success(await listMembers(await requireUserContext(), podId));
});

export const POST = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  return success(await addMember(await requireUserContext(), podId, addMemberSchema.parse(await parseJson(request))), 201);
});
