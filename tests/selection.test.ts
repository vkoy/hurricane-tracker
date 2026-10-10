import { expect, it } from "vitest";
import { utilityAssessment } from "../src/lib/selection";
import type { DashboardData, Assessment } from "../src/lib/types";

it("withholds a low all-storm classification when another active storm has no footprint", () => {
  const assessment = {
    utilityId: "u",
    stormId: "known",
    score: 0,
    risk: "Low",
    explanation: "Known footprint does not intersect.",
  } as Assessment;
  const data = {
    storms: [{ id: "known" }, { id: "unknown" }],
    geometry: { wind: { features: [{ properties: { stormId: "known" } }] } },
    assessments: [assessment],
  } as unknown as DashboardData;
  expect(utilityAssessment(data, "u", "")?.score).toBeNull();
  expect(utilityAssessment(data, "u", "known")?.score).toBe(0);
  expect(utilityAssessment(data, "u", "unknown")).toBeUndefined();
});
