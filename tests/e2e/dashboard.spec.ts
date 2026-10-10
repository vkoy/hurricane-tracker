import { expect, test } from "@playwright/test";
import { assessUtility, DEFAULT_WEIGHTS } from "../../src/lib/scoring";
import type {
  DashboardData,
  HazardFeature,
  UtilityFeature,
} from "../../src/lib/types";
const empty = { type: "FeatureCollection" as const, features: [] };
const source = {
  id: "nhc-current",
  name: "NHC · active cyclones",
  state: "live" as const,
  url: "https://www.nhc.noaa.gov/",
  attribution: "NOAA",
  fetchedAt: "2025-06-01T00:00:00Z",
  issuedAt: null,
  refreshMinutes: 10,
  message: "No active cyclones.",
  license: "U.S. government data",
};
const quiet: DashboardData = {
  storms: [],
  geometry: { tracks: empty, points: empty, cones: empty, wind: empty },
  utilities: empty,
  assessments: [],
  sources: [
    source,
    { ...source, id: "nhc-gis", name: "NHC GIS" },
    {
      ...source,
      id: "utilities",
      name: "Utility territories",
      state: "not-configured",
      message: "Not connected",
    },
  ],
  fetchedAt: "2025-06-01T00:00:00Z",
  forecastTimes: [],
  weights: DEFAULT_WEIGHTS,
};
// Explicitly synthetic data exists only in automated tests. Never shipped as dashboard data.
const utility: UtilityFeature = {
  type: "Feature",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-84, 28],
        [-81, 28],
        [-81, 31],
        [-84, 31],
        [-84, 28],
      ],
    ],
  },
  properties: {
    id: "fixture-utility",
    name: "Synthetic test utility",
    state: "FL",
    type: "Test",
    customers: null,
    website: null,
    sourceUrl: "https://example.test",
    sourceDate: "2025-01-01",
  },
};
const wind: HazardFeature = {
  ...utility,
  properties: {
    stormId: "fixture-storm",
    name: "Synthetic test cyclone",
    kind: "wind",
    validAt: "2025-06-01T06:00:00Z",
    issuedAt: "2025-06-01T00:00:00Z",
    windKnots: 64,
    sourceUrl: "https://example.test",
    color: "#7d9df5",
  },
};
test("actual application renders an interactive basemap and truthful provider states", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Storm intelligence", exact: false }),
  ).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".map-loading")).toHaveCount(0, { timeout: 30000 });
  await expect(page.getByText("Checking official advisories")).toHaveCount(0, {
    timeout: 35000,
  });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Fit United States" }).click();
  await expect(page.getByTestId("map-shell")).toHaveAttribute(
    "data-map-idle",
    "true",
    { timeout: 30000 },
  );
  await expect(page.getByTestId("map-shell")).toHaveAttribute(
    "data-features-ready",
    "true",
    { timeout: 30000 },
  );
  const mapSize = await page.locator(".map-canvas").boundingBox();
  expect(mapSize?.height).toBeGreaterThan(400);
  await page.screenshot({
    path: `test-results/stormgrid-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("verified no-storm response is distinct from provider unavailability", async ({
  page,
}, testInfo) => {
  await page.route("**/api/dashboard", (r) => r.fulfill({ json: quiet }));
  await page.goto("/");
  await expect(
    page.getByText("No active tropical cyclones", { exact: true }),
  ).toBeVisible();
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Storms & layers" }).click();
  await expect(page.getByText("Quiet skies. Staying ready.")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Electric utilities", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("switch", { name: "Electric utilities", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Electric utilities", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Utility hurricane impact" }),
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Storm tracks" }),
  ).toBeChecked();
});
test("retrieved territory data drives rankings, selection, filters and details", async ({
  page,
}, testInfo) => {
  const active: DashboardData = {
    ...quiet,
    storms: [
      {
        id: "fixture-storm",
        name: "Synthetic test cyclone",
        classification: "HU",
        latitude: 29,
        longitude: -82,
        windKnots: 64,
        pressureMb: 980,
        movement: "300°",
        issuedAt: source.fetchedAt,
        advisoryUrl: source.url,
        color: "#7d9df5",
      },
    ],
    geometry: {
      ...quiet.geometry,
      wind: { type: "FeatureCollection", features: [wind] },
    },
    utilities: { type: "FeatureCollection", features: [utility] },
    assessments: [assessUtility(utility, "fixture-storm", [wind], [])],
    sources: quiet.sources.map((s) => ({ ...s, state: "live" })),
  };
  await page.route("**/api/dashboard", (r) => r.fulfill({ json: active }));
  await page.goto("/");
  if (testInfo.project.name === "mobile")
    await page
      .getByRole("button", { name: "Impact intelligence", exact: true })
      .click();
  await page.getByRole("button", { name: /Synthetic test utility/ }).click();
  await expect(
    page.getByRole("heading", { name: "Synthetic test utility", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Why this score?", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("45% data completeness")).toBeVisible();
  await page.getByRole("button", { name: "Back to utility rankings" }).click();
  await page
    .getByRole("textbox", { name: "Search utility or state" })
    .fill("no such utility");
  await expect(
    page.getByText("No utilities match these filters"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(
    page.getByRole("button", { name: /Synthetic test utility/ }),
  ).toBeVisible();
});
test("methodology and source dialogs are keyboard dismissible", async ({
  page,
}, testInfo) => {
  await page.route("**/api/dashboard", (r) => r.fulfill({ json: quiet }));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explain utility exposure colors" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Exposure methodology" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Score = Σ (available factor × weight) / Σ available weights",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
