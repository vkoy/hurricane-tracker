import type { SourceStatus } from "./types";

export interface MonitorCheck {
  id: string;
  status: "ok" | "warning" | "error";
  message: string;
  lastSuccessAt?: string | null;
}

/** Archive vintage and known partial coverage are warnings, not provider outages. */
export function evaluateSources(
  sources: SourceStatus[],
  now = Date.now(),
  activeStormCount?: number,
): MonitorCheck[] {
  const checks: MonitorCheck[] = [];
  const ids = new Set([
    "nhc-current",
    "nhc-gis",
    "utilities",
    ...sources.map((s) => s.id),
  ]);
  for (const id of ids) {
    const source = sources.find((s) => s.id === id);
    if (!source) {
      checks.push({
        id,
        status: "error",
        message: "Source status is missing.",
      });
      continue;
    }
    const age = source.fetchedAt ? now - Date.parse(source.fetchedAt) : NaN;
    const maximumAge = Math.max(30, source.refreshMinutes * 2) * 60000;
    const notRequired =
      id === "nhc-gis" && activeStormCount === 0 && source.state === "live";
    const overdue =
      !notRequired &&
      source.state !== "archived" &&
      (!Number.isFinite(age) || age < -300000 || age > maximumAge);
    const failed =
      ["unavailable", "stale", "not-configured"].includes(source.state) ||
      overdue;
    checks.push({
      id,
      status: failed
        ? "error"
        : ["partial", "archived"].includes(source.state)
          ? "warning"
          : "ok",
      message: overdue
        ? `No recent successful retrieval (limit ${maximumAge / 60000} minutes). ${source.message}`
        : source.message,
      lastSuccessAt: source.fetchedAt,
    });
  }
  return checks;
}

export function monitoringStatus(checks: MonitorCheck[]) {
  return checks.some((c) => c.status === "error")
    ? "error"
    : checks.some((c) => c.status === "warning")
      ? "warning"
      : "ok";
}
