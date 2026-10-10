import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { getOntarioUtilities } from "../src/lib/server/ontario-utilities";
import { getUtilities } from "../src/lib/server/providers";
import { assessUtility, overlapPercent } from "../src/lib/scoring";
import { bboxPolygon } from "@turf/turf";
import type { HazardFeature } from "../src/lib/types";

afterEach(() => vi.restoreAllMocks());

describe("reviewed Ontario boundaries", () => {
  it("loads the three validated records with truthful dates and provenance", async () => {
    const result = await getOntarioUtilities();
    expect(result.source.state).toBe("archived");
    expect(result.source.issuedAt).toBeNull();
    expect(result.source.licenseUrl).toContain(
      "open-government-licence-ontario",
    );
    expect(result.utilities.features).toHaveLength(3);
    for (const f of result.utilities.features) {
      expect(f.properties.country).toBe("Canada");
      expect(f.properties.sourceDate).toBeNull();
      expect(f.properties.customers).toBeNull();
      expect(f.properties.sourceRetrievedAt).toBeTruthy();
      expect(f.properties.attribution).toContain(
        "Contains information licensed",
      );
    }
    const manifest = JSON.parse(
      readFileSync("data/ontario-client-source.json", "utf8"),
    );
    expect(manifest.excluded.map((r: { id: string }) => r.id)).toEqual([
      "ON-ED-2003-0043",
    ]);
  });
  it("uses real Canadian polygons in geographic analysis without inventing exposed customers", async () => {
    const { utilities } = await getOntarioUtilities();
    const toronto = utilities.features.find(
      (f) => f.properties.id === "ON-ED-2002-0497",
    )!;
    // Synthetic hazard covers Toronto only in this test, never in production feeds.
    const hazard = bboxPolygon([-80, 43, -79, 44]);
    expect(overlapPercent(toronto, [hazard])).toBeCloseTo(100, 0);
    const wind = {
      ...hazard,
      properties: { stormId: "fixture", kind: "wind", windKnots: 64 },
    } as HazardFeature;
    const assessment = assessUtility(toronto, "fixture", [wind], []);
    expect(assessment.territoryPercent).toBeCloseTo(100, 0);
    expect(assessment.score).not.toBeNull();
    expect(assessment.customersExposed).toBeNull();
    expect(assessment.reportedOutages).toBeNull();
    expect(assessUtility(toronto, "fixture", [], []).score).toBeNull();
  });
  it("composes the default providers but respects disabling bundled archives", async () => {
    vi.stubEnv("UTILITY_SERVICE_URL", "");
    vi.stubEnv("UTILITY_DISABLE_ARCHIVE", "false");
    try {
      const result = await getUtilities();
      expect(result.utilities.features).toHaveLength(2923);
      expect(result.supplementalSources?.[0].id).toBe("utilities-ontario");
      vi.stubEnv("UTILITY_DISABLE_ARCHIVE", "true");
      expect((await getUtilities()).utilities.features).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("reports a missing bundle without crashing other data providers", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(
      "/tmp/stormgrid-no-such-snapshot-directory",
    );
    const result = await getOntarioUtilities();
    expect(result.source.state).toBe("unavailable");
    expect(result.utilities.features).toHaveLength(0);
  });
});
