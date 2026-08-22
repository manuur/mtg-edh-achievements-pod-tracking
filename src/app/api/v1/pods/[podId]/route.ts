import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { updatePodSchema } from "@/lib/validation";
import { getPod, setPodArchived, updatePod } from "@/server/pods";

const paramsSchema = z.object({ podId: z.uuid() });

export const GET = withApi<{ podId: string }>(async (_request, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  return success(await getPod(await requireUserContext(), podId));
});

export const PATCH = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  return success(await updatePod(await requireUserContext(), podId, updatePodSchema.parse(await parseJson(request))));
});

export const DELETE = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = paramsSchema.parse(await route.params);
  const body = z.object({ version: z.number().int().positive(), archived: z.boolean().default(true) }).parse(await parseJson(request));
  return success(await setPodArchived(await requireUserContext(), podId, body.archived, body.version));
});
