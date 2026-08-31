import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { updateGameModeSchema } from "@/lib/validation";
import { setGameModeArchived, updateGameMode } from "@/server/game-modes";

const paramsSchema = z.object({ code: z.string().regex(/^[A-Z0-9]+(?:_[A-Z0-9]+)*$/).max(64) });

export const PATCH = withApi<{ code: string }>(async (request: NextRequest, route) => {
  const { code } = paramsSchema.parse(await route.params);
  return success(await updateGameMode(await requireUserContext(), code, updateGameModeSchema.parse(await parseJson(request))));
});

export const DELETE = withApi<{ code: string }>(async (request: NextRequest, route) => {
  const { code } = paramsSchema.parse(await route.params);
  const { version } = z.object({ version: z.number().int().positive() }).parse(await parseJson(request));
  return success(await setGameModeArchived(await requireUserContext(), code, version, true));
});
