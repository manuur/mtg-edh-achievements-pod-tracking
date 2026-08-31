import type { NextRequest } from "next/server";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { reorderAchievementCategoriesSchema } from "@/lib/validation";
import { reorderAchievementCategories } from "@/server/achievements";

export const PATCH = withApi(async (request: NextRequest) => {
  const input = reorderAchievementCategoriesSchema.parse(await parseJson(request));
  return success(await reorderAchievementCategories(await requireUserContext(), input));
});
