import { EnvHttpProxyAgent, fetch } from "undici";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

const dispatcher = new EnvHttpProxyAgent();
const MAX_BYTES = 24 * 1024 * 1024;
const requests = new Map<string, Promise<unknown>>();
// Disk persistence is optional: a storage failure must not discard a valid feed.
const memory = new Map<string, Cached<unknown>>();
const CACHE_WARNING =
  "Persistent cache unavailable; using memory until restart. Check STORMGRID_CACHE_DIR and the disk mount.";
const cacheDir = () =>
  process.env.STORMGRID_CACHE_DIR ||
  path.join(process.cwd(), ".stormgrid-cache");
interface Cached<T> {
  data: T;
  fetchedAt: string;
  stale: boolean;
  warning?: string;
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    dispatcher,
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json",
      "User-Agent":
        "StormGrid-Intelligence/0.1 (public weather data; 10-minute cache)",
    },
  });
  if (!response.ok)
    throw new Error(`Provider returned HTTP ${response.status}.`);
  const size = Number(response.headers.get("content-length"));
  if (size > MAX_BYTES)
    throw new Error("Provider response exceeds the configured size limit.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Provider returned an empty response.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Provider response exceeds the configured size limit.");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Last successful normalized value is retained; failed fetches never replace good data. */
export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<Cached<T>> {
  const directory = cacheDir();
  const file = path.join(
    directory,
    createHash("sha256").update(key).digest("hex") + ".json",
  );
  const existing = requests.get(file);
  if (existing) return structuredClone(await existing) as Cached<T>;
  const task = (async () => {
    let saved = (memory.get(file) as Cached<T> | undefined) ?? null;
    if (!saved) {
      try {
        saved = JSON.parse(await readFile(file, "utf8"));
      } catch {
        /* no saved success */
      }
    }
    if (saved && Date.now() - Date.parse(saved.fetchedAt) < ttlMs)
      return { ...saved, stale: false };
    let result: Cached<T>;
    try {
      result = {
        data: await load(),
        fetchedAt: new Date().toISOString(),
        stale: false,
      };
    } catch (error) {
      if (saved)
        return {
          ...saved,
          stale: true,
          warning: saved.warning,
        };
      throw error;
    }
    try {
      await mkdir(directory, { recursive: true });
      const temporary = file + "." + process.pid + ".tmp";
      await writeFile(temporary, JSON.stringify(result));
      await rename(temporary, file);
    } catch {
      result.warning = CACHE_WARNING;
      if (saved?.warning !== CACHE_WARNING)
        console.warn(`[StormGrid] ${CACHE_WARNING}`);
    }
    memory.delete(file);
    memory.set(file, result);
    // Bound memory across successive advisories and provider configuration changes.
    while (memory.size > 8) memory.delete(memory.keys().next().value!);
    return result;
  })();
  requests.set(file, task);
  try {
    return structuredClone(await task);
  } finally {
    requests.delete(file);
  }
}
