import type { NextRequest } from "next/server";
import { z } from "zod";
import { success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { podMetrics } from "@/server/metrics";
import { resolveApiMetricRange } from "@/lib/metric-range";

export const GET = withApi<{ podId: string }>(async (request: NextRequest, route) => {
  const { podId } = z.object({ podId: z.uuid() }).parse(await route.params);
  return success(await podMetrics(await requireUserContext(), podId, resolveApiMetricRange(request.nextUrl.searchParams)));
});
