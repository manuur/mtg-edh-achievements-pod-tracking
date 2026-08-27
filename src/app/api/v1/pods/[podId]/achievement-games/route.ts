import type { NextRequest } from "next/server";
import { z } from "zod";
import { success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { listAchievementGames } from "@/server/achievements";

const paramsSchema = z.object({ podId: z.uuid() });
const querySchema = z.object({
  playerId: z.uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});

export const GET = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  return success(await listAchievementGames(await requireUserContext(), podId, query.playerId, query));
});
