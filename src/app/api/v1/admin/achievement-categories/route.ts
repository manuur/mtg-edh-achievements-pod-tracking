import type { NextRequest } from "next/server";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { achievementCategorySchema } from "@/lib/validation";
import { createAchievementCategory, listAchievementCategories } from "@/server/achievements";

export const GET = withApi(async () => {
  return success(await listAchievementCategories(await requireUserContext()));
});

export const POST = withApi(async (request: NextRequest) => {
  const input = achievementCategorySchema.parse(await parseJson(request));
  return success(await createAchievementCategory(await requireUserContext(), input), 201);
});
