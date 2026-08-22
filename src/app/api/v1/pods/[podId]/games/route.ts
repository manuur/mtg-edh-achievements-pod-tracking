import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { createGameSchema } from "@/lib/validation";
import { createGame, listGames } from "@/server/games";

const paramsSchema = z.object({ podId: z.uuid() });

export const GET = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  const query = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().optional(), includeArchived: z.enum(["true"]).optional().transform(Boolean) }).parse(Object.fromEntries(request.nextUrl.searchParams));
  return success(await listGames(await requireUserContext(), podId, query));
});

export const POST = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  const raw = await parseJson(request);
  const headerKey = request.headers.get("idempotency-key");
  const body = typeof raw === "object" && raw !== null && headerKey ? { ...raw, idempotencyKey: headerKey } : raw;
  return success(await createGame(await requireUserContext(), podId, createGameSchema.parse(body)), 201);
});
