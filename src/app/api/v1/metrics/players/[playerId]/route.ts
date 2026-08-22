import type { NextRequest } from "next/server";
import { z } from "zod";
import { success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { playerMetrics } from "@/server/metrics";
import { resolveApiMetricRange } from "@/lib/metric-range";

export const GET = withApi<{ playerId: string }>(async (request: NextRequest, route) => {
  const { playerId } = z.object({ playerId: z.uuid() }).parse(await route.params);
  const podId = z.uuid().optional().parse(request.nextUrl.searchParams.get("podId") ?? undefined);
  return success(await playerMetrics(await requireUserContext(), playerId, podId, resolveApiMetricRange(request.nextUrl.searchParams)));
});
