import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { snapshot } = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("../src/lib/server/dashboard", () => ({ dashboardSnapshot: snapshot }));
let directory: string;
beforeEach(async () => {
  vi.resetModules();
  directory = await mkdtemp(join(tmpdir(), "stormgrid-monitor-test-"));
  vi.stubEnv("STORMGRID_CACHE_DIR", directory);
  snapshot.mockResolvedValue({
    storms: [],
    utilities: { features: [{}] },
    sources: ["nhc-current", "nhc-gis", "utilities"].map((id) => ({
      id,
      state: id === "utilities" ? "archived" : "live",
      fetchedAt: new Date().toISOString(),
      refreshMinutes: 10,
      message: "Test fixture",
    })),
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("deployment storage checks", () => {
  it("checks actual write access and coalesces repeated status requests", async () => {
    const { deploymentHealth } = await import("../src/lib/server/monitoring");
    const [first, second] = await Promise.all([
      deploymentHealth(),
      deploymentHealth(),
    ]);
    expect(first).toEqual(second);
    expect(first.status).toBe("warning");
    expect(first.checks.find((c) => c.id === "cache-storage")?.status).toBe(
      "ok",
    );
  });
  it("reports unwritable cache storage as an operational failure without exposing its path", async () => {
    const blocked = join(directory, "blocked");
    await writeFile(blocked, "not a directory");
    vi.stubEnv("STORMGRID_CACHE_DIR", blocked);
    const { deploymentHealth } = await import("../src/lib/server/monitoring");
    const report = await deploymentHealth();
    expect(report.status).toBe("error");
    expect(report.checks.find((c) => c.id === "cache-storage")?.status).toBe(
      "error",
    );
    expect(JSON.stringify(report)).not.toContain(directory);
  });
});
