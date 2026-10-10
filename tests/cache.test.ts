import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cached } from "../src/lib/server/http";
let directory = "";
afterEach(async () => {
  delete process.env.STORMGRID_CACHE_DIR;
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe("provider last-success cache", () => {
  it("keeps a successful feed available when its cache directory cannot be written", async () => {
    directory = await mkdtemp(join(tmpdir(), "stormgrid-cache-test-"));
    const blocked = join(directory, "not-a-directory");
    await writeFile(blocked, "file blocks cache directory creation");
    process.env.STORMGRID_CACHE_DIR = blocked;
    let calls = 0;
    const loader = async () => {
      calls++;
      return { count: 3 };
    };
    const first = await cached("unwritable", 60000, loader);
    const second = await cached("unwritable", 60000, loader);
    expect(first.data).toEqual({ count: 3 });
    expect(first.stale).toBe(false);
    expect(first.warning).toContain("Persistent cache unavailable");
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(calls).toBe(1);
    const fallback = await cached("unwritable", 0, async () => {
      throw new Error("Provider unavailable");
    });
    expect(fallback.data).toEqual(first.data);
    expect(fallback.stale).toBe(true);
    expect(fallback.fetchedAt).toBe(first.fetchedAt);
  });
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
  it("does not allow callers to mutate the last successful snapshot", async () => {
    directory = await mkdtemp(join(tmpdir(), "stormgrid-cache-test-"));
    process.env.STORMGRID_CACHE_DIR = directory;
    const first = await cached("immutable", 60000, async () => ({ count: 7 }));
    first.data.count = 99;
    const second = await cached("immutable", 60000, async () => ({ count: 0 }));
    expect(second.data.count).toBe(7);
  });
  it("does not invent a snapshot when the first provider request fails", async () => {
    directory = await mkdtemp(join(tmpdir(), "stormgrid-cache-test-"));
    process.env.STORMGRID_CACHE_DIR = directory;
    await expect(cached("missing", 60000, async () => {
      throw new Error("Provider unavailable");
    })).rejects.toThrow("Provider unavailable");
  });
});
