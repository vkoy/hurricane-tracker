import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cached } from "../src/lib/server/http";
let directory = "";
afterEach(async () => {
  delete process.env.STORMGRID_CACHE_DIR;
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe("provider last-success cache", () => {
  it("retains the last successful payload, marks refresh failure stale, and records no false update", async () => {
    directory = await mkdtemp(join(tmpdir(), "stormgrid-cache-test-"));
    process.env.STORMGRID_CACHE_DIR = directory;
    const first = await cached("test", 0, async () => ({ count: 7 }));
    const fallback = await cached("test", 0, async () => {
      throw new Error("Provider unavailable");
    });
    expect(fallback.data).toEqual(first.data);
    expect(fallback.stale).toBe(true);
    expect(fallback.fetchedAt).toBe(first.fetchedAt);
  });
  it("deduplicates concurrent requests", async () => {
    directory = await mkdtemp(join(tmpdir(), "stormgrid-cache-test-"));
    process.env.STORMGRID_CACHE_DIR = directory;
    let calls = 0;
    const loader = async () => {
      calls++;
      return { ok: true };
    };
    await Promise.all([
      cached("same", 60000, loader),
      cached("same", 60000, loader),
    ]);
    expect(calls).toBe(1);
  });
});
