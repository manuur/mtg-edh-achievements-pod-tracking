import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { updateGameSchema } from "@/lib/validation";
import { getGame, setGameArchived, updateGame } from "@/server/games";

const paramsSchema = z.object({ podId: z.uuid(), gameId: z.uuid() });

export const GET = withApi<{ podId: string; gameId: string }>(async (_request, route) => {
  const { podId, gameId } = paramsSchema.parse(await route.params);
  return success(await getGame(await requireUserContext(), podId, gameId));
});

export const PATCH = withApi<{ podId: string; gameId: string }>(async (request: NextRequest, route) => {
  const { podId, gameId } = paramsSchema.parse(await route.params);
  return success(await updateGame(await requireUserContext(), podId, gameId, updateGameSchema.parse(await parseJson(request))));
});

export const DELETE = withApi<{ podId: string; gameId: string }>(async (request: NextRequest, route) => {
  const { podId, gameId } = paramsSchema.parse(await route.params);
  const body = z.object({ version: z.number().int().positive(), archived: z.boolean().default(true) }).parse(await parseJson(request));
  return success(await setGameArchived(await requireUserContext(), podId, gameId, body.archived, body.version));
});
