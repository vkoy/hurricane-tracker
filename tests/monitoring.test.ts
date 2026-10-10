import { describe, expect, it } from "vitest";
import { evaluateSources, monitoringStatus } from "../src/lib/monitoring";
import type { SourceStatus } from "../src/lib/types";
const now = Date.parse("2026-10-10T12:00:00Z");
const live = (id: string): SourceStatus => ({
  id,
  name: id,
  state: "live",
  url: "https://example.test",
  attribution: "test",
  license: "test",
  fetchedAt: new Date(now).toISOString(),
  issuedAt: null,
  refreshMinutes: 10,
  message: "Retrieved",
});
describe("deployment monitoring", () => {
  it("accepts verified quiet weather and flags archives without a false outage", () => {
    const checks = evaluateSources(
      [
        live("nhc-current"),
        { ...live("nhc-gis"), fetchedAt: null },
        {
          ...live("utilities"),
          state: "archived",
          fetchedAt: "2020-01-01T00:00:00Z",
        },
      ],
      now,
      0,
    );
    expect(monitoringStatus(checks)).toBe("warning");
    expect(checks.filter((c) => c.status === "error")).toHaveLength(0);
  });
  it("fails on unavailable, stale, missing, and overdue feeds", () => {
    for (const source of [
      { ...live("nhc-current"), state: "unavailable" as const },
      { ...live("nhc-current"), state: "stale" as const },
      { ...live("nhc-current"), fetchedAt: "2026-10-10T10:00:00Z" },
    ]) {
      expect(
        evaluateSources([source, live("nhc-gis"), live("utilities")], now)[0]
          .status,
      ).toBe("error");
    }
    expect(monitoringStatus(evaluateSources([], now))).toBe("error");
  });
  it("reports partial GIS coverage without restarting a healthy service", () => {
    expect(
      monitoringStatus(
        evaluateSources(
          [
            live("nhc-current"),
            { ...live("nhc-gis"), state: "partial" },
            live("utilities"),
          ],
          now,
        ),
      ),
    ).toBe("warning");
  });
});
