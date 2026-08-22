import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { createPodSchema } from "@/lib/validation";
import { createPod, listPods } from "@/server/pods";

export const GET = withApi(async (request: NextRequest) => {
  const includeArchived = z.enum(["true"]).optional().transform(Boolean).parse(request.nextUrl.searchParams.get("includeArchived") ?? undefined);
  return success(await listPods(await requireUserContext(), includeArchived));
});

export const POST = withApi(async (request: NextRequest) => {
  const data = createPodSchema.parse(await parseJson(request));
  return success(await createPod(await requireUserContext(), data), 201);
});
