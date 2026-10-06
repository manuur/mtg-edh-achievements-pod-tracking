import type { NextRequest } from "next/server";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { createGameModeSchema } from "@/lib/validation";
import { createGameMode, listAdminGameModes } from "@/server/game-modes";

export const GET = withApi(async () => success(await listAdminGameModes(await requireUserContext())));

export const POST = withApi(async (request: NextRequest) => success(
  await createGameMode(await requireUserContext(), createGameModeSchema.parse(await parseJson(request))),
  201,
));
