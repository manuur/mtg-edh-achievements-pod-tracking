import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { hardDeleteSchema } from "@/lib/validation";
import { hardDeletePlayer } from "@/server/admin";

const paramsSchema = z.object({ playerId: z.uuid() });

export const DELETE = withApi<{ playerId: string }>(async (request: NextRequest, route) => {
  const { playerId } = paramsSchema.parse(await route.params);
  const input = hardDeleteSchema.parse(await parseJson(request));
  return success(await hardDeletePlayer(await requireUserContext(), playerId, input));
});
