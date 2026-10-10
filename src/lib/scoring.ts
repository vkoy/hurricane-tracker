import { area, bbox, featureCollection, intersect, union } from "@turf/turf";
import type { Feature } from "geojson";
import type {
  Area,
  Assessment,
  Factor,
  FactorKey,
  HazardFeature,
  Risk,
  UtilityFeature,
  Weights,
} from "./types";

export const DEFAULT_WEIGHTS: Weights = {
  wind: 25,
  territory: 20,
  customers: 20,
  infrastructure: 15,
  surge: 10,
  uncertainty: 10,
};
export const FACTOR_LABELS: Record<FactorKey, string> = {
  wind: "Forecast wind",
  territory: "Territory overlap",
  customers: "Customers exposed",
  infrastructure: "Critical grid assets",
  surge: "Surge & flooding",
  uncertainty: "Scenario exposure",
};
const boundsCache = new WeakMap<Feature<Area>, number[]>();
const areaCache = new WeakMap<Feature<Area>, number>();
function bounds(feature: Feature<Area>) {
  let result = boundsCache.get(feature);
  if (!result) {
    result = bbox(feature);
    boundsCache.set(feature, result);
  }
  return result;
}

export function validateWeights(value: unknown): Weights {
  if (!value || typeof value !== "object")
    throw new Error("Weights must be an object.");
  const entries = Object.keys(DEFAULT_WEIGHTS) as FactorKey[];
  const result = {} as Weights;
  for (const key of entries) {
    const n = (value as Weights)[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100)
      throw new Error(`Invalid weight: ${key}`);
    result[key] = n;
  }
  if (Math.abs(Object.values(result).reduce((a, b) => a + b, 0) - 100) > 0.001)
    throw new Error("Weights must sum to 100.");
  return result;
}

/** Union footprints first: overlapping forecast periods must not double-count land. */
export function overlapPercent(
  territory: Feature<Area>,
  footprints: Feature<Area>[],
): number | null {
  if (!footprints.length) return null;
  const b = bounds(territory);
  const candidates = footprints.filter((f) => {
    const h = bounds(f);
    return b[0] <= h[2] && b[2] >= h[0] && b[1] <= h[3] && b[3] >= h[1];
  });
  let denominator = areaCache.get(territory);
  if (denominator === undefined) {
    denominator = area(territory);
    areaCache.set(territory, denominator);
  }
  if (!Number.isFinite(denominator) || denominator <= 0)
    throw new Error("Invalid service territory area.");
  if (!candidates.length) return 0;
  const merged =
    candidates.length === 1
      ? candidates[0]
      : union(featureCollection(candidates));
  if (!merged) throw new Error("Could not combine hazard footprints.");
  const overlap = intersect(featureCollection([territory, merged]));
  return overlap
    ? Math.max(0, Math.min(100, (area(overlap) / denominator) * 100))
    : 0;
}

export function riskFor(score: number): Risk {
  if (score < 20) return "Low";
  if (score < 40) return "Moderate";
  if (score < 60) return "High";
  if (score < 80) return "Very high";
  return "Extreme";
}

export function weightedScore(factors: Factor[]): {
  score: number | null;
  completeness: number;
} {
  const available = factors.filter((f) => f.value !== null && f.weight > 0);
  const complete = available.reduce((n, f) => n + f.weight, 0);
  const total = factors.reduce((n, f) => n + f.weight, 0);
  if (!complete) return { score: null, completeness: 0 };
  for (const f of available)
    if (!Number.isFinite(f.value) || f.value! < 0 || f.value! > 100)
      throw new Error(`Invalid factor: ${f.key}`);
  return {
    score: Math.round(
      available.reduce((n, f) => n + f.value! * f.weight, 0) / complete,
    ),
    completeness: Math.round((complete / total) * 100),
  };
}

export function assessUtility(
  utility: UtilityFeature,
  stormId: string,
  wind: HazardFeature[],
  cones: HazardFeature[],
  weights = DEFAULT_WEIGHTS,
): Assessment {
  validateWeights(weights);
  const hazards = wind.filter(
    (f) =>
      f.properties.stormId === stormId &&
      f.properties.kind === "wind" &&
      f.properties.windKnots !== null &&
      f.properties.windKnots >= 34,
  );
  const stormCones = cones.filter((f) => f.properties.stormId === stormId);
  const territoryPercent = overlapPercent(utility, hazards);
  const conePercent = overlapPercent(utility, stormCones);
  const intersecting = hazards.filter(
    (h) => (overlapPercent(utility, [h]) ?? 0) > 0,
  );
  const windKnots = hazards.length
    ? intersecting.length
      ? Math.max(...intersecting.map((f) => f.properties.windKnots!))
      : 0
    : null;
  const values: Record<FactorKey, number | null> = {
    wind: windKnots === null ? null : Math.min(100, windKnots),
    territory: territoryPercent,
    customers: null,
    infrastructure: null,
    surge: null,
    uncertainty: conePercent,
  };
  const explanations: Record<FactorKey, string> = {
    wind: "Maximum intersecting official forecast wind-radius threshold in knots, capped at 100. This is a hazard threshold, not a site-specific wind prediction.",
    territory:
      "Geodesic area intersecting the union of official forecast ≥34 kt wind polygons / total territory area. Overlaps across times are counted once.",
    customers:
      "Unavailable: customer locations or a validated spatial allocation model are required. Total customers are not uniformly distributed.",
    infrastructure:
      "Unavailable: no verified, permitted asset inventory connected. Asset exposure does not imply failure.",
    surge: "Unavailable: no verified inundation-depth layer connected.",
    uncertainty:
      "Percent of territory within the official center-track uncertainty cone. Scenario sensitivity only; the cone is not a wind footprint or a probability of local impact.",
  };
  const factors = (Object.keys(weights) as FactorKey[]).map((key) => ({
    key,
    label: FACTOR_LABELS[key],
    weight: weights[key],
    value: values[key],
    explanation: explanations[key],
  }));
  const result = weightedScore(factors);
  // A cone alone cannot establish hazard exposure. Never publish a cone-only risk score.
  const score = territoryPercent === null ? null : result.score;
  const explanation =
    score === null
      ? "Exposure not assessed. Official forecast wind footprints are unavailable; a forecast cone alone cannot establish wind exposure."
      : `${Math.round(territoryPercent!)}% of mapped territory intersects official forecast wind zones; ${windKnots} kt is the highest intersecting wind threshold. ${result.completeness}% of model weight has available inputs. Missing factors are excluded and remaining weights renormalized. This is not an outage prediction.`;
  return {
    utilityId: utility.properties.id,
    stormId,
    score,
    risk: score === null ? null : riskFor(score),
    completeness: result.completeness,
    confidence:
      result.completeness >= 80
        ? "High"
        : result.completeness >= 60
          ? "Moderate"
          : "Limited",
    territoryPercent,
    conePercent,
    windKnots,
    customersExposed: null,
    assetsExposed: null,
    reportedOutages: null,
    factors,
    explanation,
    computedAt: new Date().toISOString(),
  };
}
