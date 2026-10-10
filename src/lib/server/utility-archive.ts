import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  Area,
  SourceStatus,
  UtilityProperties,
  UtilityCoverage,
} from "../types";
import type { FeatureCollection } from "geojson";

export const ARCHIVE_SOURCE =
  "https://www.arcgis.com/home/item.html?id=597555ce8e4a4892a030784a7c657fdd";
let snapshot: Promise<{
  utilities: FeatureCollection<Area, UtilityProperties>;
  source: SourceStatus;
  coverage: UtilityCoverage;
}> | null = null;
export function getUtilityArchive() {
  if (!snapshot)
    snapshot = (async () => {
      const directory = path.join(process.cwd(), "data");
      const [geometry, manifestText] = await Promise.all([
        readFile(path.join(directory, "utility-territories.geojson"), "utf8"),
        readFile(path.join(directory, "utility-source.json"), "utf8"),
      ]);
      const utilities = JSON.parse(geometry) as FeatureCollection<
        Area,
        UtilityProperties
      >;
      const manifest = JSON.parse(manifestText);
      const source: SourceStatus = {
        id: "utilities",
        name: "Utility territories · archived",
        state: "archived",
        url: ARCHIVE_SOURCE,
        attribution:
          "ORNL / DOE CESER · public HIFLD archive, hosted by NBAM_Org",
        fetchedAt: manifest.normalizationRetrievedAt || manifest.retrievedAt,
        issuedAt: "2024-09-30T00:00:00.000Z",
        refreshMinutes: 1440,
        license:
          "Public domain information; public use permitted. Source metadata reviewed. Not current legal service boundaries.",
        message: `${utilities.features.length.toLocaleString()} of ${manifest.sourceRecordCount.toLocaleString()} archived territories loaded. ${manifest.normalizedCount || 0} records recovered by dissolving overlaps between valid source polygons. ${manifest.excludedCount} invalid geometries remain excluded. Source dates: 2015–2023; published September 2024; archived August 2025. Boundaries are generalized, may overlap between utilities, and may be outdated. The archive is not updated by its publisher.`,
      };
      return {
        utilities,
        source,
        coverage: {
          sourceRecordCount: manifest.sourceRecordCount,
          includedCount: manifest.includedCount,
          normalizedCount: manifest.normalizedCount || 0,
          excluded: manifest.excluded,
        },
      };
    })();
  return snapshot;
}
