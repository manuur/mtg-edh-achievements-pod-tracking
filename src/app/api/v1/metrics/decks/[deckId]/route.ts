import type { NextRequest } from "next/server";
import { z } from "zod";
import { success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { deckMetrics } from "@/server/metrics";
import { resolveApiMetricRange } from "@/lib/metric-range";

export const GET = withApi<{ deckId: string }>(async (request: NextRequest, route) => {
  const { deckId } = z.object({ deckId: z.uuid() }).parse(await route.params);
  const podId = z.uuid().optional().parse(request.nextUrl.searchParams.get("podId") ?? undefined);
  return success(await deckMetrics(await requireUserContext(), deckId, podId, resolveApiMetricRange(request.nextUrl.searchParams)));
});
