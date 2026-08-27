import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { hardDeleteSchema } from "@/lib/validation";
import { hardDeleteAchievement } from "@/server/achievements";

const paramsSchema = z.object({ achievementId: z.uuid() });

export const DELETE = withApi<{ achievementId: string }>(async (request: NextRequest, route) => {
  const { achievementId } = paramsSchema.parse(await route.params);
  const input = hardDeleteSchema.parse(await parseJson(request));
  return success(await hardDeleteAchievement(await requireUserContext(), achievementId, input));
});
