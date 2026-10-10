import { assessUtility, DEFAULT_WEIGHTS, validateWeights } from "../scoring";
import type { DashboardData } from "../types";
import { getGeometry, getStorms, getUtilities } from "./providers";

export async function getDashboard(): Promise<DashboardData> {
  const weights = process.env.EXPOSURE_WEIGHTS
    ? validateWeights(JSON.parse(process.env.EXPOSURE_WEIGHTS))
    : DEFAULT_WEIGHTS;
  const [
    { storms, source: current },
    { utilities, source: utilitySource, coverage },
  ] = await Promise.all([getStorms(), getUtilities()]);
  const { geometry, source: gis } = await getGeometry(storms, current.state);
  for (const storm of storms) {
    const points = geometry.points.features
      .filter(
        (p) =>
          p.properties.stormId === storm.id &&
          p.properties.kind === "forecast" &&
          p.properties.windKnots !== null,
      )
      .sort((a, b) =>
        (a.properties.validAt || "").localeCompare(b.properties.validAt || ""),
      );
    storm.windKnots = points[0]?.properties.windKnots ?? null;
    storm.windValidAt = points[0]?.properties.validAt ?? null;
    storm.movementSpeedKnots = points[0]?.properties.movementSpeedKnots ?? null;
    storm.category = points[0]?.properties.category ?? null;
  }
  const assessments = [];
  for (const storm of storms) {
    if (!geometry.wind.features.some((f) => f.properties.stormId === storm.id))
      continue;
    for (const utility of utilities.features) {
      try {
        assessments.push(
          assessUtility(
            utility,
            storm.id,
            geometry.wind.features,
            geometry.cones.features,
            weights,
          ),
        );
      } catch {
        /* Invalid spatial intersections are missing assessments, never zero scores. */
      }
    }
  }
  return {
    storms,
    geometry,
    utilities,
    assessments,
    sources: [current, gis, utilitySource],
    fetchedAt: new Date().toISOString(),
    weights,
    utilityCoverage: coverage,
    forecastTimes: [
      ...new Set(
        geometry.points.features.flatMap((p) =>
          p.properties.validAt ? [p.properties.validAt] : [],
        ),
      ),
    ].sort(),
  };
}

let pending: Promise<DashboardData> | null = null;
let recent: { data: DashboardData; at: number } | null = null;
export async function dashboardSnapshot() {
  if (recent && Date.now() - recent.at < 60000) return recent.data;
  if (pending) return pending;
  pending = getDashboard().then((data) => {
    recent = { data, at: Date.now() };
    return data;
  });
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
