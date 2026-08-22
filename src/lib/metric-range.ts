import type { MetricRange } from "@/server/metrics";
import { metricRangeSchema } from "@/lib/validation";

export type MetricRangeKey = "all" | "30d" | "90d" | "custom";
export interface MetricRangeQuery { range?: string; from?: string; to?: string }

export function resolveMetricRange(query: MetricRangeQuery, now = new Date()): { key: MetricRangeKey; values: MetricRange } {
  if (query.range === "30d" || query.range === "90d") {
    const days = query.range === "30d" ? 30 : 90;
    return { key: query.range, values: { from: new Date(now.getTime() - days * 86_400_000).toISOString(), to: now.toISOString() } };
  }
  if (query.range === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "") && query.from! <= query.to!) {
    return { key: "custom", values: { from: `${query.from}T00:00:00.000Z`, to: `${query.to}T23:59:59.999Z` } };
  }
  return { key: "all", values: {} };
}

export function resolveApiMetricRange(searchParams: URLSearchParams, now = new Date()): MetricRange {
  const parsed = metricRangeSchema.parse(Object.fromEntries(searchParams));
  if (parsed.range === "30d" || parsed.range === "90d") return resolveMetricRange({ range: parsed.range }, now).values;
  if (parsed.from && parsed.to) return { from: parsed.from, to: parsed.to };
  return {};
}
