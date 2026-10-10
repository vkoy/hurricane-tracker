import { describe, expect, it } from "vitest";
import {
  identifyStorm,
  isoDate,
  nhcValidTime,
  nhcIssueTime,
  normalizeStorms,
  normalizeUtilities,
  numberOrNull,
  safePublicUrl,
} from "../src/lib/server/providers";
const config = {
  url: "https://example.test/boundaries",
  sourceDate: "2025-01-01",
  fields: {
    id: "ID",
    name: "NAME",
    state: "STATE",
    type: "TYPE",
    customers: "CUSTOMERS",
    website: "WEBSITE",
  },
};
const feature = {
  type: "Feature",
  properties: { ID: "1", NAME: "Synthetic unit-test territory", STATE: "XX" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  },
};
describe("provider validation", () => {
  it("converts an official advisory clock with an explicit time zone", () => {
    expect(nhcIssueTime("1100 PM PDT Fri Oct 09 2026")).toBe(
      "2026-10-10T06:00:00.000Z",
    );
    expect(nhcIssueTime(null)).toBeNull();
  });
  it("distinguishes an empty active storm feed from invalid data", () => {
    expect(normalizeStorms({ activeStorms: [] })).toEqual([]);
    expect(() => normalizeStorms({ error: "unavailable" })).toThrow();
  });
  it("validates official coordinates and leaves ambiguous wind units unknown", () => {
    const raw = {
      id: "al012025",
      name: "Test fixture",
      classification: "TS",
      latitudeNumeric: 25,
      longitudeNumeric: -80,
      intensity: "40",
      pressure: 1000,
      lastUpdate: "2025-06-01T00:00:00Z",
    };
    expect(normalizeStorms({ activeStorms: [raw] })[0]).toMatchObject({
      windKnots: null,
      latitude: 25,
      longitude: -80,
    });
    expect(() =>
      normalizeStorms({ activeStorms: [{ ...raw, latitudeNumeric: 200 }] }),
    ).toThrow();
  });
  it("rejects incomplete boundary pages and duplicate territory IDs", () => {
    expect(() =>
      normalizeUtilities(
        {
          type: "FeatureCollection",
          features: [feature],
          exceededTransferLimit: true,
        },
        config,
      ),
    ).toThrow();
    expect(() =>
      normalizeUtilities(
        { type: "FeatureCollection", features: [feature, feature] },
        config,
      ),
    ).toThrow();
  });
  it("keeps missing customer counts missing", () =>
    expect(
      normalizeUtilities(
        { type: "FeatureCollection", features: [feature] },
        config,
      )[0].properties.customers,
    ).toBeNull());
  it("rejects non-polygon boundaries", () =>
    expect(() =>
      normalizeUtilities(
        {
          type: "FeatureCollection",
          features: [
            { ...feature, geometry: { type: "Point", coordinates: [0, 0] } },
          ],
        },
        config,
      ),
    ).toThrow());
  it("normalizes only valid numbers, dates and HTTPS links", () => {
    expect(numberOrNull(null)).toBeNull();
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("4")).toBe(4);
    expect(isoDate("202506011200")).toBe("2025-06-01T12:00:00.000Z");
    expect(isoDate("bad")).toBeNull();
    expect(safePublicUrl("javascript:alert(1)")).toBeNull();
    expect(safePublicUrl("https://example.test?token=private")).toBeNull();
    expect(numberOrNull(-999999)).toBeNull();
    expect(numberOrNull(false)).toBeNull();
  });
  it("parses numeric NHC DTGs as dates, not milliseconds in 1970", () => {
    expect(isoDate(2026101006)).toBe("2026-10-10T06:00:00.000Z");
    expect(nhcValidTime("01/0600", "2026-10-31T18:00:00Z")).toBe(
      "2026-11-01T06:00:00.000Z",
    );
    expect(nhcValidTime("30/1800", "2026-11-01T00:00:00Z")).toBe(
      "2026-10-30T18:00:00.000Z",
    );
  });
  it("associates the NOAA source-file identifier with a storm, regardless of display-name prefixes", () => {
    const storms = normalizeStorms({
      activeStorms: [
        {
          id: "ep182026",
          name: "Rachel",
          latitudeNumeric: 24,
          longitudeNumeric: -122,
        },
      ],
    });
    expect(
      identifyStorm(
        {
          idp_source: "ep182026-052A_5day_pts",
          stormname: "Tropical Storm Rachel",
        },
        storms,
      )?.id,
    ).toBe("ep182026");
  });
});
