import type { FeatureCollection, Geometry, LineString, Point } from "geojson";
import { area, booleanValid } from "@turf/turf";
import { cached, fetchJson } from "./http";
import { getUtilityArchive } from "./utility-archive";
import { getOntarioUtilities } from "./ontario-utilities";
import {
  emptyCollection,
  type Area,
  type HazardFeature,
  type SourceStatus,
  type Storm,
  type StormGeometry,
  type StormProperties,
  type UtilityFeature,
  type UtilityProperties,
  type UtilityCoverage,
} from "../types";

export const NHC_CURRENT = "https://www.nhc.noaa.gov/CurrentStorms.json";
export const NHC_GIS =
  "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer";
const COLORS = ["#7d9df5", "#f1b169", "#cb91f5", "#5dd5c0", "#f28099"];
type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value && typeof value === "object" ? (value as Row) : {};
const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
export const numberOrNull = (value: unknown): number | null =>
  (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
  Number.isFinite(Number(value)) &&
  Number(value) !== -999999 &&
  Number(value) !== 9999
    ? Number(value)
    : null;
export function isoDate(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && /^(19|20)\d{8}(\d{2})?$/.test(String(value)))
    value = String(value);
  if (typeof value === "string" && /^(19|20)\d{8}(\d{2})?$/.test(value)) {
    const s = value;
    const date = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12) || "00"}:00Z`;
    return Number.isNaN(Date.parse(date)) ? null : new Date(date).toISOString();
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
const message = (e: unknown) =>
  e instanceof Error && /HTTP \d{3}|size limit/.test(e.message)
    ? e.message
    : "Provider could not be reached or its response could not be validated. Check source access and network policy.";
function status(
  id: string,
  name: string,
  url: string,
  attribution: string,
  refreshMinutes: number,
): SourceStatus {
  return {
    id,
    name,
    url,
    attribution,
    refreshMinutes,
    state: "unavailable",
    fetchedAt: null,
    issuedAt: null,
    message: "Awaiting a successful provider response.",
    license: id.startsWith("nhc")
      ? "NOAA U.S. government information; attribution required. See NOAA disclaimer."
      : "Provider reuse terms must be reviewed before connecting.",
  };
}

export function normalizeStorms(payload: unknown): Storm[] {
  const active = row(payload).activeStorms;
  if (!Array.isArray(active))
    throw new Error("NHC activeStorms schema is unavailable.");
  return active.map((raw, index) => {
    const s = row(raw);
    const lat = numberOrNull(s.latitudeNumeric),
      lon = numberOrNull(s.longitudeNumeric);
    if (
      !s.id ||
      !s.name ||
      lat === null ||
      lon === null ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      throw new Error("Invalid official storm coordinates.");
    return {
      id: text(s.id).toLowerCase(),
      name: text(s.name),
      classification: text(s.classification),
      latitude: lat,
      longitude: lon,
      binNumber: text(s.binNumber),
      // The current-storm summary does not supply a unit declaration. Wind is populated from documented GIS MAXWIND (knots).
      windKnots: null,
      pressureMb: numberOrNull(s.pressure),
      movement: s.movementDir != null ? `${text(s.movementDir)}°` : null,
      issuedAt: isoDate(s.lastUpdate),
      advisoryUrl:
        safePublicUrl(row(s.publicAdvisory).url) || "https://www.nhc.noaa.gov/",
      color: COLORS[index % COLORS.length],
    };
  });
}
export function safePublicUrl(value: unknown): string | null {
  try {
    const u = new URL(text(value));
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ![...u.searchParams.keys()].some((k) =>
        /token|secret|api.?key|password/i.test(k),
      )
      ? u.href
      : null;
  } catch {
    return null;
  }
}

export async function getStorms(): Promise<{
  storms: Storm[];
  source: SourceStatus;
}> {
  const source = status(
    "nhc-current",
    "NHC · active cyclones",
    NHC_CURRENT,
    "NOAA National Hurricane Center",
    10,
  );
  try {
    const result = await cached("nhc-current-v2", 600000, async () =>
      normalizeStorms(await fetchJson(NHC_CURRENT)),
    );
    const dates = result.data
      .flatMap((s) => (s.issuedAt ? [s.issuedAt] : []))
      .sort();
    const oldAdvisory = result.data.some(
      (s) => !s.issuedAt || Date.now() - Date.parse(s.issuedAt) > 12 * 3600000,
    );
    Object.assign(source, {
      state: result.stale || oldAdvisory ? "stale" : "live",
      fetchedAt: result.fetchedAt,
      issuedAt: dates.at(-1) ?? null,
      message: result.stale
        ? "Last successful snapshot. Refresh failed."
        : oldAdvisory
          ? "At least one advisory is older than 12 hours or has no issue time."
          : result.data.length
            ? "Official current storm positions retrieved."
            : "NHC reports no active tropical cyclones in its monitored basins.",
    });
    if (result.warning) source.message += ` ${result.warning}`;
    return { storms: result.data, source };
  } catch (e) {
    source.message = message(e);
    return { storms: [], source };
  }
}

function geometryEmpty(): StormGeometry {
  return {
    tracks: emptyCollection(),
    points: emptyCollection(),
    cones: emptyCollection(),
    wind: emptyCollection(),
  };
}
function getProperty(p: Row, ...names: string[]) {
  for (const name of names) {
    const key = Object.keys(p).find((k) => k.toUpperCase() === name);
    if (key && p[key] != null) return p[key];
  }
  return null;
}
export function identifyStorm(p: Row, storms: Storm[]): Storm | undefined {
  const id = text(
    getProperty(p, "STORMID", "STORM_ID", "ATCFID", "ATCF_ID"),
  ).toLowerCase();
  const sourceId = text(getProperty(p, "IDP_SOURCE"))
    .toLowerCase()
    .match(/(?:al|ep|cp)\d{6}/)?.[0];
  const name = text(
    getProperty(p, "STORMNAME", "STORM_NAME", "NAME"),
  ).toLowerCase();
  return (
    storms.find(
      (s) => (id && s.id === id) || (sourceId && s.id === sourceId),
    ) || storms.find((s) => name && s.name.toLowerCase() === name)
  );
}

/** NHC DD/HHMM valid times are UTC; choose the adjacent month nearest the advisory. */
export function nhcValidTime(
  value: unknown,
  issuedAt: string | null,
): string | null {
  const abbreviated = text(value).match(/^(\d{2})\/(\d{2})(\d{2})$/);
  if (!abbreviated) return isoDate(value);
  if (!issuedAt) return null;
  const anchor = new Date(issuedAt),
    day = Number(abbreviated[1]),
    hour = Number(abbreviated[2]),
    minute = Number(abbreviated[3]);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const candidates = [-1, 0, 1]
    .map(
      (offset) =>
        new Date(
          Date.UTC(
            anchor.getUTCFullYear(),
            anchor.getUTCMonth() + offset,
            day,
            hour,
            minute,
          ),
        ),
    )
    .filter((d) => d.getUTCDate() === day);
  candidates.sort(
    (a, b) =>
      Math.abs(a.getTime() - anchor.getTime()) -
      Math.abs(b.getTime() - anchor.getTime()),
  );
  return candidates[0]?.toISOString() ?? null;
}

export function nhcIssueTime(value: unknown): string | null {
  const match = text(value).match(
    /^(\d{1,4})\s+(AM|PM)\s+(AST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|HST|UTC)\s+\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})$/i,
  );
  if (!match) return isoDate(value);
  const digits = match[1].padStart(4, "0");
  const hour =
    (Number(digits.slice(0, 2)) % 12) +
    (match[2].toUpperCase() === "PM" ? 12 : 0);
  const minute = Number(digits.slice(2));
  const offsets: Record<string, number> = {
    AST: 4,
    EST: 5,
    EDT: 4,
    CST: 6,
    CDT: 5,
    MST: 7,
    MDT: 6,
    PST: 8,
    PDT: 7,
    HST: 10,
    UTC: 0,
  };
  const month = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(match[4].toLowerCase());
  if (month < 0 || minute > 59) return null;
  return new Date(
    Date.UTC(
      Number(match[6]),
      month,
      Number(match[5]),
      hour + offsets[match[3].toUpperCase()],
      minute,
    ),
  ).toISOString();
}

export async function getGeometry(
  storms: Storm[],
  currentState: SourceStatus["state"],
): Promise<{ geometry: StormGeometry; source: SourceStatus }> {
  const source = status(
    "nhc-gis",
    "NHC · forecast geometry",
    NHC_GIS,
    "NOAA / NWS official tropical cyclone GIS",
    10,
  );
  if (!storms.length) {
    source.state = currentState === "live" ? "live" : "unavailable";
    source.message =
      currentState === "live"
        ? "No active cyclones; forecast geometry is not required."
        : "Official storm list unavailable; forecast association cannot be verified.";
    return { geometry: geometryEmpty(), source };
  }
  try {
    const result = await cached(
      "nhc-geometry-v6-" + storms.map((s) => s.id + s.issuedAt).join(","),
      600000,
      async () => {
        const service = row(await fetchJson(NHC_GIS + "?f=json"));
        if (service.error || !Array.isArray(service.layers))
          throw new Error("Invalid NHC GIS service.");
        const candidates = (service.layers as Row[]).filter(
          (l) =>
            /forecast.*(point|track|cone|wind)|past.*(track|point)|observed.*track/i.test(
              text(l.name),
            ) &&
            l.subLayerIds == null &&
            storms.some(
              (s) => !s.binNumber || text(l.name).startsWith(s.binNumber + " "),
            ),
        );
        if (!candidates.length)
          throw new Error("No supported NHC forecast layers published.");
        const geometry = geometryEmpty();
        let failed = 0;
        // A small bounded concurrency batch avoids flooding the public service.
        for (let i = 0; i < candidates.length; i += 4) {
          await Promise.all(
            candidates.slice(i, i + 4).map(async (l) => {
              try {
                const url = `${NHC_GIS}/${Number(l.id)}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;
                const fc = row(await fetchJson(url));
                if (
                  fc.type !== "FeatureCollection" ||
                  !Array.isArray(fc.features) ||
                  fc.exceededTransferLimit
                )
                  throw new Error("Incomplete GIS layer.");
                for (const raw of fc.features) {
                  const f = row(raw);
                  const p = row(f.properties);
                  const g = row(f.geometry);
                  const storm = identifyStorm(p, storms);
                  if (!storm) continue;
                  const name = text(l.name);
                  const kind: StormProperties["kind"] = /cone/i.test(name)
                    ? "cone"
                    : /forecast.*wind/i.test(name)
                      ? "wind"
                      : /past|observed/i.test(name)
                        ? "observed"
                        : "forecast";
                  const props: StormProperties = {
                    stormId: storm.id,
                    name: storm.name,
                    kind,
                    validAt: nhcValidTime(
                      getProperty(
                        p,
                        "VALIDTIME",
                        "VALID_TIME",
                        "DTG",
                        "FLDATELBL",
                      ),
                      storm.issuedAt,
                    ),
                    issuedAt: nhcIssueTime(
                      getProperty(p, "ADVDATE", "ADVISORY_DATE"),
                    ),
                    windKnots: numberOrNull(
                      getProperty(
                        p,
                        kind === "wind" ? "RADII" : "MAXWIND",
                        kind === "wind" ? "WINDRADII" : "MAX_WIND",
                      ),
                    ),
                    sourceUrl: url,
                    color: storm.color,
                    movementSpeedKnots: numberOrNull(getProperty(p, "TCSPD")),
                    category: numberOrNull(getProperty(p, "SSNUM")),
                  };
                  if (g.type === "LineString")
                    geometry.tracks.features.push({
                      type: "Feature",
                      geometry: g as unknown as LineString,
                      properties: props,
                    });
                  else if (g.type === "Point")
                    geometry.points.features.push({
                      type: "Feature",
                      geometry: g as unknown as Point,
                      properties: props,
                    });
                  else if (g.type === "Polygon" || g.type === "MultiPolygon") {
                    const feature: HazardFeature = {
                      type: "Feature",
                      geometry: g as unknown as Area,
                      properties: props,
                    };
                    if (
                      !booleanValid(feature) ||
                      !Number.isFinite(area(feature))
                    )
                      continue;
                    if (kind === "cone") geometry.cones.features.push(feature);
                    else if (
                      kind === "wind" &&
                      props.windKnots !== null &&
                      props.windKnots >= 34
                    )
                      geometry.wind.features.push(feature);
                  }
                }
              } catch {
                failed++;
              }
            }),
          );
        }
        if (failed)
          throw new Error(
            "One or more official GIS layers are unavailable or incomplete.",
          );
        if (
          !geometry.tracks.features.length &&
          !geometry.cones.features.length &&
          !geometry.points.features.length
        )
          throw new Error(
            "No forecast features could be associated with current storms.",
          );
        return geometry;
      },
    );
    const missing = storms.filter(
      (s) =>
        !result.data.points.features.some((p) => p.properties.stormId === s.id),
    );
    Object.assign(source, {
      state:
        result.stale || currentState === "stale"
          ? "stale"
          : missing.length
            ? "partial"
            : "live",
      fetchedAt: result.fetchedAt,
      issuedAt:
        result.data.points.features
          .map((p) => p.properties.issuedAt)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
      message: result.stale
        ? "Last successful geometry snapshot; refresh failed."
        : `${result.data.cones.features.length} forecast cones; ${result.data.wind.features.length} official forecast wind polygons.${missing.length ? ` Partial coverage: no GIS positions for ${missing.map((s) => s.name).join(", ")}.` : ""} Missing hazard layers are not inferred from the cone.`,
    });
    if (result.warning) source.message += ` ${result.warning}`;
    return { geometry: result.data, source };
  } catch (e) {
    source.message = message(e);
    return { geometry: geometryEmpty(), source };
  }
}

export function normalizeUtilities(
  payload: unknown,
  config: {
    url: string;
    sourceDate: string | null;
    fields: Record<string, string>;
  },
): UtilityFeature[] {
  const fc = row(payload);
  if (
    fc.type !== "FeatureCollection" ||
    !Array.isArray(fc.features) ||
    fc.exceededTransferLimit
  )
    throw new Error("Invalid or truncated utility GeoJSON.");
  const seen = new Set<string>();
  return fc.features.map((raw) => {
    const f = row(raw);
    const p = row(f.properties);
    const g = row(f.geometry);
    const id = text(p[config.fields.id]);
    const name = text(p[config.fields.name]);
    if (
      !id ||
      !name ||
      seen.has(id) ||
      !["Polygon", "MultiPolygon"].includes(text(g.type))
    )
      throw new Error(
        "Utility layer requires unique IDs, names, and polygon geometry.",
      );
    seen.add(id);
    const result: UtilityFeature = {
      type: "Feature",
      geometry: g as unknown as Area,
      properties: {
        id,
        name,
        state: text(p[config.fields.state]) || "Not provided",
        type: text(p[config.fields.type]) || "Not provided",
        customers:
          (numberOrNull(p[config.fields.customers]) ?? -1) < 0
            ? null
            : numberOrNull(p[config.fields.customers]),
        website: safePublicUrl(p[config.fields.website]),
        sourceUrl: config.url,
        sourceDate: isoDate(p[config.fields.sourceDate]) || config.sourceDate,
        city: text(p[config.fields.city]),
        customerYear: text(p[config.fields.customerYear]) || null,
        boundarySource: text(p[config.fields.boundarySource]),
      },
    };
    if (!booleanValid(result) || area(result) <= 0)
      throw new Error("Invalid utility polygon.");
    const coords = JSON.stringify(g.coordinates);
    if (!coords || coords.includes("null"))
      throw new Error("Invalid utility coordinates.");
    return result;
  });
}

export async function getUtilities(): Promise<{
  utilities: FeatureCollection<Area, UtilityProperties>;
  source: SourceStatus;
  coverage?: UtilityCoverage;
  supplementalSources?: SourceStatus[];
}> {
  const url = process.env.UTILITY_SERVICE_URL;
  if (!url && process.env.UTILITY_DISABLE_ARCHIVE !== "true") {
    const [archive, ontario] = await Promise.all([
      getUtilityArchive(),
      getOntarioUtilities(),
    ]);
    return {
      ...archive,
      utilities: {
        type: "FeatureCollection",
        features: [
          ...archive.utilities.features,
          ...ontario.utilities.features,
        ],
      },
      supplementalSources: [ontario.source],
    };
  }
  const source = status(
    "utilities",
    "Electric utility territories",
    safePublicUrl(process.env.UTILITY_SOURCE_URL) ||
      safePublicUrl(url) ||
      "https://www.eia.gov/maps/",
    process.env.UTILITY_ATTRIBUTION ||
      "Verified utility or public agency boundaries",
    1440,
  );
  if (
    !url ||
    !process.env.UTILITY_LICENSE ||
    !process.env.UTILITY_ATTRIBUTION ||
    !process.env.UTILITY_SOURCE_DATE
  ) {
    source.state = "not-configured";
    source.message =
      "No reviewed service-territory provider connected. A permitted polygon source, attribution, reuse terms, and source date are required. EIA customer tables alone are not service boundaries.";
    return { utilities: emptyCollection(), source };
  }
  source.license = process.env.UTILITY_LICENSE;
  try {
    if (!safePublicUrl(url))
      throw new Error("A public HTTPS source is required.");
    const fields = {
      id: "ID",
      name: "NAME",
      state: "STATE",
      type: "TYPE",
      customers: "CUSTOMERS",
      website: "WEBSITE",
      ...JSON.parse(process.env.UTILITY_FIELD_MAP || "{}"),
    };
    const config = {
      url: source.url,
      sourceDate: process.env.UTILITY_SOURCE_DATE!,
      fields,
    };
    const result = await cached(
      "utilities-v3-" + url + JSON.stringify(config),
      86400000,
      async () => {
        if (!/\/(FeatureServer|MapServer)\/\d+\/?$/i.test(url))
          return normalizeUtilities(await fetchJson(url), config);
        const meta = row(await fetchJson(url + "?f=json"));
        if (meta.error || meta.geometryType !== "esriGeometryPolygon")
          throw new Error("A polygon service layer is required.");
        const idsResponse = row(
          await fetchJson(url + "/query?where=1%3D1&returnIdsOnly=true&f=json"),
        );
        if (
          !Array.isArray(idsResponse.objectIds) ||
          idsResponse.objectIds.length > 10000
        )
          throw new Error(
            "Unsupported utility dataset size; use a filtered or generalized layer.",
          );
        const features: UtilityFeature[] = [];
        const chunk = Math.min(Number(meta.maxRecordCount) || 500, 500);
        for (let i = 0; i < idsResponse.objectIds.length; i += chunk) {
          const ids = idsResponse.objectIds
            .slice(i, i + chunk)
            .map(Number)
            .join(",");
          const pageUrl =
            url +
            "/query?" +
            new URLSearchParams({
              objectIds: ids,
              outFields: "*",
              outSR: "4326",
              f: "geojson",
              geometryPrecision: "5",
            });
          features.push(
            ...normalizeUtilities(await fetchJson(pageUrl), config),
          );
        }
        if (
          features.length !== idsResponse.objectIds.length ||
          new Set(features.map((f) => f.properties.id)).size !== features.length
        )
          throw new Error("Incomplete utility coverage response.");
        return features;
      },
    );
    Object.assign(source, {
      state: result.stale ? "stale" : "live",
      fetchedAt: result.fetchedAt,
      issuedAt: isoDate(process.env.UTILITY_SOURCE_DATE),
      message: result.stale
        ? "Last successful territory snapshot; refresh failed."
        : `${result.data.length.toLocaleString()} territories loaded from the configured provider. Coverage is limited to this source.`,
    });
    if (result.warning) source.message += ` ${result.warning}`;
    return {
      utilities: { type: "FeatureCollection", features: result.data },
      source,
    };
  } catch (e) {
    source.message = message(e);
    return { utilities: emptyCollection(), source };
  }
}
