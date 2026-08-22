import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { createDeckSchema } from "@/lib/validation";
import { createDeck, listDecks } from "@/server/decks";

export const GET = withApi(async (request: NextRequest) => {
  const query = z.object({ ownerPlayerId: z.uuid().optional(), podId: z.uuid().optional(), includeArchived: z.enum(["true"]).optional().transform(Boolean) }).parse(Object.fromEntries(request.nextUrl.searchParams));
  return success(await listDecks(await requireUserContext(), query.ownerPlayerId, query.podId, query.includeArchived));
});

export const POST = withApi(async (request: NextRequest) => {
  return success(await createDeck(await requireUserContext(), createDeckSchema.parse(await parseJson(request))), 201);
});
