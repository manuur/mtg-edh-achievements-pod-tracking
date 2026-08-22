import type { NextRequest } from "next/server";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { achievementSchema } from "@/lib/validation";
import { createAchievement, listCatalog } from "@/server/achievements";

export const GET = withApi(async (request: NextRequest) => {
  const context = await requireUserContext();
  return success(await listCatalog(context, request.nextUrl.searchParams.get("archived") === "true"));
});

export const POST = withApi(async (request: NextRequest) => {
  return success(await createAchievement(await requireUserContext(), achievementSchema.parse(await parseJson(request))), 201);
});
