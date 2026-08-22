import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { updateAchievementSchema } from "@/lib/validation";
import { updateAchievement } from "@/server/achievements";

const paramsSchema = z.object({ achievementId: z.uuid() });

export const PATCH = withApi<{ achievementId: string }>(async (request: NextRequest, route) => {
  const { achievementId } = paramsSchema.parse(await route.params);
  return success(await updateAchievement(await requireUserContext(), achievementId, updateAchievementSchema.parse(await parseJson(request))));
});

export const DELETE = withApi<{ achievementId: string }>(async (request: NextRequest, route) => {
  const { achievementId } = paramsSchema.parse(await route.params);
  const { version } = z.object({ version: z.number().int().positive() }).parse(await parseJson(request));
  return success(await updateAchievement(await requireUserContext(), achievementId, { version, archived: true }));
});
