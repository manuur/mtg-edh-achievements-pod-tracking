import { describe, expect, it } from "vitest";
import { resolveApiMetricRange, resolveMetricRange } from "@/lib/metric-range";

const now = new Date("2026-08-22T12:00:00.000Z");

describe("metric ranges", () => {
  it("keeps all-time unbounded", () => expect(resolveMetricRange({ range: "all" }, now)).toEqual({ key: "all", values: {} }));
  it("creates rolling 30 and 90 day windows", () => {
    expect(resolveMetricRange({ range: "30d" }, now).values.from).toBe("2026-07-23T12:00:00.000Z");
    expect(resolveMetricRange({ range: "90d" }, now).values.from).toBe("2026-05-24T12:00:00.000Z");
  });
  it("normalizes a valid custom date range", () => expect(resolveMetricRange({ range: "custom", from: "2026-08-01", to: "2026-08-22" }, now).values).toEqual({ from: "2026-08-01T00:00:00.000Z", to: "2026-08-22T23:59:59.999Z" }));
  it("falls back safely for incomplete custom input", () => expect(resolveMetricRange({ range: "custom", from: "2026-08-01" }, now).key).toBe("all"));
  it("validates API ISO ranges and rolling shortcuts", () => {
    expect(resolveApiMetricRange(new URLSearchParams("range=30d"), now).from).toBe("2026-07-23T12:00:00.000Z");
    expect(resolveApiMetricRange(new URLSearchParams("range=custom&from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-22T23%3A59%3A59.999Z"), now)).toEqual({ from: "2026-08-01T00:00:00.000Z", to: "2026-08-22T23:59:59.999Z" });
    expect(() => resolveApiMetricRange(new URLSearchParams("from=2026-08-01T00%3A00%3A00.000Z"), now)).toThrow();
  });
});
