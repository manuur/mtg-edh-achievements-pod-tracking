import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { updateMemberSchema } from "@/lib/validation";
import { updateMember } from "@/server/pods";

const paramsSchema = z.object({ podId: z.uuid(), playerId: z.uuid() });

export const PATCH = withApi<{ podId: string; playerId: string }>(async (request: NextRequest, route) => {
  const { podId, playerId } = paramsSchema.parse(await route.params);
  return success(await updateMember(await requireUserContext(), podId, playerId, updateMemberSchema.parse(await parseJson(request))));
});

export const DELETE = withApi<{ podId: string; playerId: string }>(async (request: NextRequest, route) => {
  const { podId, playerId } = paramsSchema.parse(await route.params);
  const { version } = z.object({ version: z.number().int().positive() }).parse(await parseJson(request));
  return success(await updateMember(await requireUserContext(), podId, playerId, { status: "ARCHIVED", version }));
});
