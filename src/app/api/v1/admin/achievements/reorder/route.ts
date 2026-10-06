import type { NextRequest } from "next/server";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { reorderAchievementsSchema } from "@/lib/validation";
import { reorderAchievements } from "@/server/achievements";

export const PATCH = withApi(async (request: NextRequest) => {
  const input = reorderAchievementsSchema.parse(await parseJson(request));
  return success(await reorderAchievements(await requireUserContext(), input));
});
