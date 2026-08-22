import type { NextRequest } from "next/server";
import { success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { playerMetrics } from "@/server/metrics";
import { resolveApiMetricRange } from "@/lib/metric-range";

export const GET = withApi(async (request: NextRequest) => {
  const context = await requireUserContext();
  return success(await playerMetrics(context, context.player.id, undefined, resolveApiMetricRange(request.nextUrl.searchParams)));
});
