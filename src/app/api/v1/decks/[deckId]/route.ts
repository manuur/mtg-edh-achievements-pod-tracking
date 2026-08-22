import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { updateDeckSchema } from "@/lib/validation";
import { getDeck, updateDeck } from "@/server/decks";

const paramsSchema = z.object({ deckId: z.uuid() });

export const GET = withApi<{ deckId: string }>(async (request, route) => {
  const { deckId } = paramsSchema.parse(await route.params);
  const podId = z.uuid().optional().parse(request.nextUrl.searchParams.get("podId") ?? undefined);
  return success(await getDeck(await requireUserContext(), deckId, podId));
});

export const PATCH = withApi<{ deckId: string }>(async (request: NextRequest, route) => {
  const { deckId } = paramsSchema.parse(await route.params);
  return success(await updateDeck(await requireUserContext(), deckId, updateDeckSchema.parse(await parseJson(request))));
});

export const DELETE = withApi<{ deckId: string }>(async (request: NextRequest, route) => {
  const { deckId } = paramsSchema.parse(await route.params);
  const { version } = z.object({ version: z.number().int().positive() }).parse(await parseJson(request));
  return success(await updateDeck(await requireUserContext(), deckId, { version, archived: true }));
});
