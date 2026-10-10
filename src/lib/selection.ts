import type { Assessment, DashboardData } from "./types";
const indexes = new WeakMap<
  DashboardData,
  Map<string, Map<string, Assessment>>
>();

/** Unknown hazards for one active storm cannot become an all-storm low-risk label. */
export function utilityAssessment(
  data: DashboardData,
  utilityId: string,
  stormId: string,
): Assessment | undefined {
  let byStorm = indexes.get(data);
  if (!byStorm) {
    byStorm = new Map();
    indexes.set(data, byStorm);
  }
  let byUtility = byStorm.get(stormId);
  if (!byUtility) {
    byUtility = new Map();
    for (const a of data.assessments) {
      if (stormId && a.stormId !== stormId) continue;
      const previous = byUtility.get(a.utilityId);
      if (!previous || (a.score ?? -1) > (previous.score ?? -1))
        byUtility.set(a.utilityId, a);
    }
    const missingStorm =
      !stormId &&
      data.storms.some(
        (s) =>
          !data.geometry.wind.features.some(
            (f) => f.properties.stormId === s.id,
          ),
      );
    if (missingStorm)
      for (const [id, best] of byUtility)
        if (best.score === 0)
          byUtility.set(id, {
            ...best,
            score: null,
            risk: null,
            explanation:
              "Some active storms have no verified forecast wind footprint. No all-storm low-exposure classification can be established. Select an individual storm to inspect its available assessment.",
          });
    byStorm.set(stormId, byUtility);
  }
  return byUtility.get(utilityId);
}
