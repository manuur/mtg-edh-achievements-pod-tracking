import { describe, expect, it } from "vitest";
import { zonedLocalDateTimeToIso } from "@/lib/timezone";

describe("POD timezone conversion", () => {
  it("stores a Buenos Aires wall-clock time as UTC", () => {
    expect(zonedLocalDateTimeToIso("2026-08-22T20:00", "America/Argentina/Buenos_Aires")).toBe("2026-08-22T23:00:00.000Z");
  });

  it("uses the target date's daylight-saving offset", () => {
    expect(zonedLocalDateTimeToIso("2026-08-22T20:00", "America/New_York")).toBe("2026-08-23T00:00:00.000Z");
    expect(zonedLocalDateTimeToIso("2026-01-22T20:00", "America/New_York")).toBe("2026-01-23T01:00:00.000Z");
  });
});
