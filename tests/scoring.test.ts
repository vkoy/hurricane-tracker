import { describe, expect, it } from "vitest";
import { polygon } from "@turf/turf";
import {
  assessUtility,
  DEFAULT_WEIGHTS,
  overlapPercent,
  riskFor,
  validateWeights,
  weightedScore,
} from "../src/lib/scoring";
import type { HazardFeature, UtilityFeature } from "../src/lib/types";

// Synthetic geometry is used only in tests, never as operational application data.
const territory = polygon(
  [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ],
  ],
  {
    id: "test",
    name: "Test fixture",
    state: "XX",
    type: "Test",
    customers: 100,
    website: null,
    sourceUrl: "https://example.test",
    sourceDate: null,
  },
) as UtilityFeature;
const half = polygon([
  [
    [0, 0],
    [1, 0],
    [1, 2],
    [0, 2],
    [0, 0],
  ],
]);
const outside = polygon([
  [
    [5, 5],
    [6, 5],
    [6, 6],
    [5, 6],
    [5, 5],
  ],
]);
const wind = {
  ...half,
  properties: {
    stormId: "test-storm",
    name: "Fixture",
    kind: "wind",
    windKnots: 64,
    validAt: null,
    issuedAt: null,
    sourceUrl: "https://example.test",
    color: "#fff",
  },
} as HazardFeature;
describe("geographic overlap", () => {
  it("measures a partial geodesic intersection", () =>
    expect(overlapPercent(territory, [half])).toBeCloseTo(50, 1));
  it("does not double-count overlapping forecast positions", () =>
    expect(overlapPercent(territory, [half, half])).toBeCloseTo(50, 1));
  it("distinguishes known nonintersection from missing footprints", () => {
    expect(overlapPercent(territory, [outside])).toBe(0);
    expect(overlapPercent(territory, [])).toBeNull();
  });
});
describe("transparent scoring", () => {
  it("renormalizes available inputs and reports weighted completeness", () => {
    const result = assessUtility(territory, "test-storm", [wind], []);
    expect(result.score).toBe(58);
    expect(result.completeness).toBe(45);
    expect(result.customersExposed).toBeNull();
    expect(result.reportedOutages).toBeNull();
  });
  it("never scores a cone as a wind footprint", () => {
    const cone: HazardFeature = {
      ...wind,
      properties: { ...wind.properties, kind: "cone", windKnots: null },
    };
    const result = assessUtility(territory, "test-storm", [], [cone]);
    expect(result.score).toBeNull();
    expect(result.territoryPercent).toBeNull();
    expect(result.conePercent).toBeCloseTo(50, 1);
  });
  it("does not mix storms or use customer counts as spatial exposure", () => {
    expect(
      assessUtility(territory, "another-storm", [wind], []).score,
    ).toBeNull();
    expect(
      assessUtility(territory, "test-storm", [wind], []).customersExposed,
    ).toBeNull();
  });
  it("returns unknown for all missing factors", () =>
    expect(weightedScore([]).score).toBeNull());
  it("validates administrator weights", () => {
    expect(validateWeights(DEFAULT_WEIGHTS)).toEqual(DEFAULT_WEIGHTS);
    expect(() => validateWeights({ ...DEFAULT_WEIGHTS, wind: -25 })).toThrow();
    expect(() => validateWeights({ ...DEFAULT_WEIGHTS, wind: 26 })).toThrow();
  });
  it("classifies boundaries consistently", () =>
    expect([0, 20, 40, 60, 80, 100].map(riskFor)).toEqual([
      "Low",
      "Moderate",
      "High",
      "Very high",
      "Extreme",
      "Extreme",
    ]));
});
