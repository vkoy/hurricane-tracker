import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FeatureCollection } from "geojson";
import type { Area, SourceStatus, UtilityProperties } from "../types";

/** A reviewed, bundled snapshot. Failure does not hide the other providers. */
export async function getOntarioUtilities(): Promise<{
  utilities: FeatureCollection<Area, UtilityProperties>;
  source: SourceStatus;
}> {
  const source: SourceStatus = {
    id: "utilities-ontario",
    name: "Ontario client territories · snapshot",
    state: "unavailable",
    url: "https://www.arcgis.com/home/item.html?id=94a074ee344e4c7fb60fed59171fd8bd",
    attribution:
      "Contains information licensed under the Open Government Licence – Ontario. Ontario Ministry of Energy / Ontario Energy Board.",
    license:
      "Open Government Licence – Ontario. Illustrative service areas, not precise legal boundaries.",
    licenseUrl: "https://www.ontario.ca/page/open-government-licence-ontario",
    fetchedAt: null,
    issuedAt: null,
    refreshMinutes: 0,
    message:
      "Ontario boundary snapshot could not be loaded. Missing coverage is not zero exposure.",
  };
  try {
    const [geojson, metadata] = await Promise.all([
      readFile(
        path.join(process.cwd(), "data/ontario-client-territories.geojson"),
        "utf8",
      ),
      readFile(
        path.join(process.cwd(), "data/ontario-client-source.json"),
        "utf8",
      ),
    ]);
    const utilities = JSON.parse(geojson) as FeatureCollection<
      Area,
      UtilityProperties
    >;
    const manifest = JSON.parse(metadata);
    if (
      utilities.type !== "FeatureCollection" ||
      !utilities.features.length ||
      utilities.features.length !== manifest.includedCount ||
      manifest.includedCount + manifest.excluded.length !==
        manifest.requestedCount ||
      new Set(utilities.features.map((f) => f.properties.id)).size !==
        utilities.features.length
    )
      throw new Error("Incomplete Ontario snapshot");
    return {
      utilities,
      source: {
        ...source,
        state: "archived",
        fetchedAt: manifest.retrievedAt,
        message: `${manifest.includedCount} reviewed Ontario operating-company territories. ${manifest.excluded.length} excluded: ${manifest.excluded.map((r: { name: string; reason: string }) => `${r.name} (${r.reason})`).join("; ")}. Hydro One coverage includes Remote Communities only. Layer data last edited ${manifest.layerDataLastEditAt}; individual boundary effective dates are unavailable. Generalized government-published polygons for regional screening. Bundled snapshot; manual refresh and redeploy, not a live feed.`,
      },
    };
  } catch {
    return { utilities: { type: "FeatureCollection", features: [] }, source };
  }
}
