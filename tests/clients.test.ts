import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CLIENTS,
  clientView,
  scopeUtilitiesToClients,
} from "../src/lib/clients";
import type { Area, DashboardData, UtilityProperties } from "../src/lib/types";
import type { FeatureCollection } from "geojson";

const territories = JSON.parse(
  readFileSync("data/utility-territories.geojson", "utf8"),
) as FeatureCollection<Area, UtilityProperties>;
describe("client portfolio allowlist", () => {
  it("includes every requested client, merges the PSEGLI portal, and excludes other utilities", () => {
    const scoped = scopeUtilitiesToClients(territories);
    expect(CLIENTS).toHaveLength(47);
    expect(new Set(CLIENTS.map((c) => c.id)).size).toBe(47);
    expect(scoped.clients.filter((c) => c.status === "mapped")).toHaveLength(
      42,
    );
    expect(scoped.utilities.features).toHaveLength(71);
    expect(
      scoped.utilities.features.some(
        (f) => f.properties.name === "FLORIDA POWER & LIGHT CO",
      ),
    ).toBe(false);
    expect(
      scoped.utilities.features.some(
        (f) => f.properties.name === "SANTEE ELECTRIC COOP, INC",
      ),
    ).toBe(false);
    expect(
      scoped.utilities.features.some(
        (f) => f.properties.name === "THE NARRAGANSETT ELECTRIC CO",
      ),
    ).toBe(false);
    expect(scoped.clients.find((c) => c.id === "psegli")?.aliases).toContain(
      "PSEGLI - Muni portal",
    );
    expect(
      scoped.utilities.features.filter((f) => f.properties.id === "11171"),
    ).toHaveLength(1);
    expect(scoped.clients.find((c) => c.id === "peco")?.territoryIds).toEqual([
      "14940",
    ]);
  });
  it("does not confuse similarly named cooperatives or reuse a matching ID with the wrong name", () => {
    const member = territories.features.find((f) => f.properties.id === "195")!;
    const impostor = {
      ...member,
      properties: { ...member.properties, name: "Unrelated utility" },
    };
    const result = scopeUtilitiesToClients({
      type: "FeatureCollection",
      features: [impostor],
    });
    expect(result.utilities.features).toEqual([]);
    expect(result.clients.find((c) => c.id === "apc")?.status).toBe(
      "unavailable",
    );
  });
  it("keeps uncovered Canadian and telecom clients visible without fabricated geometry", () => {
    const result = scopeUtilitiesToClients(territories);
    expect(
      result.clients
        .filter((c) => c.status === "unavailable")
        .map((c) => c.id)
        .sort(),
    ).toEqual(["altice", "hydro-one", "hydro-ottawa", "nsp", "toronto"]);
    const data = { ...result, assessments: [] } as unknown as DashboardData;
    expect(clientView(data, "hydro-one")?.utilities.features).toEqual([]);
    expect(
      clientView(data, "apc")?.utilities.features.map((f) => f.properties.id),
    ).toEqual(["195"]);
  });
  it("marks a parent group partial if an expected operating territory is missing", () => {
    const partial = scopeUtilitiesToClients({
      ...territories,
      features: territories.features.filter((f) => f.properties.id !== "5027"),
    });
    expect(partial.clients.find((c) => c.id === "phi")).toMatchObject({
      status: "partial",
      missingRecords: ["DELMARVA POWER"],
    });
  });
});
