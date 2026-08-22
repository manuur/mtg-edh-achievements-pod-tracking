import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { achievementGrantSchema } from "@/lib/validation";
import { grantAchievement, listPodAchievements, revokeAchievement } from "@/server/achievements";

const paramsSchema = z.object({ podId: z.uuid() });

export const GET = withApi<{ podId: string }>(async (_request, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  return success(await listPodAchievements(await requireUserContext(), podId));
});

export const POST = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  return success(await grantAchievement(await requireUserContext(), podId, achievementGrantSchema.parse(await parseJson(request))), 201);
});

export const DELETE = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  const body = z.object({ playerId: z.uuid(), achievementId: z.uuid(), version: z.number().int().positive() }).parse(await parseJson(request));
  return success(await revokeAchievement(await requireUserContext(), podId, body.playerId, body.achievementId, body.version));
});
