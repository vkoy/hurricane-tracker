import { mkdir, writeFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  evaluateSources,
  monitoringStatus,
  type MonitorCheck,
} from "../monitoring";
import { dashboardSnapshot } from "./dashboard";

let pending: Promise<ReturnType<typeof report>> | null = null;
let recent: { at: number; data: ReturnType<typeof report> } | null = null;
function report(checks: MonitorCheck[]) {
  const revision = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT;
  return {
    service: "stormgrid-intelligence",
    status: monitoringStatus(checks),
    checkedAt: new Date().toISOString(),
    revision: revision && /^[a-f0-9]{7,40}$/i.test(revision) ? revision : null,
    checks,
  };
}

export async function deploymentHealth() {
  if (recent && Date.now() - recent.at < 60000) return recent.data;
  if (pending) return pending;
  pending = (async () => {
    const checks: MonitorCheck[] = [];
    try {
      const data = await dashboardSnapshot();
      checks.push(
        ...evaluateSources(data.sources, Date.now(), data.storms.length),
      );
      checks.push({
        id: "utility-geometries",
        status: data.utilities.features.length ? "ok" : "error",
        message: `${data.utilities.features.length.toLocaleString()} utility territories loaded. Missing coverage is not zero exposure.`,
      });
      if (data.clients) {
        const missing = data.clients.filter((c) => c.status !== "mapped");
        checks.push({
          id: "client-coverage",
          status: missing.length ? "warning" : "ok",
          message: `${data.clients.length - missing.length} of ${data.clients.length} clients have all configured boundary records. ${missing.length ? `Incomplete or unavailable: ${missing.map((c) => c.name).join(", ")}.` : ""} Mapped records do not establish current or complete service coverage.`,
        });
      }
    } catch {
      checks.push({
        id: "dashboard",
        status: "error",
        message:
          "Dashboard could not be generated. Check server configuration and bundled data files.",
      });
    }
    const directory =
      process.env.STORMGRID_CACHE_DIR ||
      path.join(process.cwd(), ".stormgrid-cache");
    const probe = path.join(directory, `.health-${randomUUID()}`);
    try {
      await mkdir(directory, { recursive: true });
      await writeFile(probe, "cache health probe", { flag: "wx" });
      await unlink(probe);
      checks.push({
        id: "cache-storage",
        status: "ok",
        message:
          "Cache storage is writable. Survival across deployments depends on the host's persistent disk configuration.",
      });
    } catch {
      await unlink(probe).catch(() => {});
      checks.push({
        id: "cache-storage",
        status: "error",
        message:
          "Cache storage is not writable. Live requests can continue in memory, but last-success fallback is lost on restart.",
      });
    }
    const data = report(checks);
    recent = { at: Date.now(), data };
    return data;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
