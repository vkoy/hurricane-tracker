import { EnvHttpProxyAgent, fetch } from "undici";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

const dispatcher = new EnvHttpProxyAgent();
const MAX_BYTES = 24 * 1024 * 1024;
const requests = new Map<string, Promise<unknown>>();
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
  const existing = requests.get(key);
  if (existing) return existing as Promise<Cached<T>>;
  const task = (async () => {
    const file = path.join(
      cacheDir(),
      createHash("sha256").update(key).digest("hex") + ".json",
    );
    let saved: Cached<T> | null = null;
    try {
      saved = JSON.parse(await readFile(file, "utf8"));
    } catch {
      /* no saved success */
    }
    if (saved && Date.now() - Date.parse(saved.fetchedAt) < ttlMs)
      return { ...saved, stale: false };
    try {
      const result = {
        data: await load(),
        fetchedAt: new Date().toISOString(),
        stale: false,
      };
      await mkdir(cacheDir(), { recursive: true });
      const temporary = file + "." + process.pid + ".tmp";
      await writeFile(temporary, JSON.stringify(result));
      await rename(temporary, file);
      return result;
    } catch (error) {
      if (saved)
        return {
          ...saved,
          stale: true,
          warning:
            error instanceof Error ? error.message : "Provider unavailable.",
        };
      throw error;
    }
  })();
  requests.set(key, task);
  try {
    return await task;
  } finally {
    requests.delete(key);
  }
}
