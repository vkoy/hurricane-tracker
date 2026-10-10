import registry from "../../data/clients.json";
import type { FeatureCollection } from "geojson";
import type {
  Area,
  ClientStatus,
  DashboardData,
  UtilityFeature,
  UtilityProperties,
} from "./types";

export const CLIENTS = registry;
const normalized = (name: string) =>
  name.trim().replace(/\s+/g, " ").toUpperCase();

/** Exact reviewed source-ID/name pairs only. No fuzzy match or inferred territory. */
export function scopeUtilitiesToClients(
  utilities: FeatureCollection<Area, UtilityProperties>,
) {
  const features: UtilityFeature[] = [];
  const clients: ClientStatus[] = CLIENTS.map(({ records, ...client }) => ({
    ...client,
    status: "unavailable",
    territoryIds: [],
    missingRecords: records.map((r) => r.name),
  }));
  for (const feature of utilities.features) {
    const owners = CLIENTS.filter((c) =>
      c.records.some(
        (r) =>
          r.id === feature.properties.id &&
          normalized(r.name) === normalized(feature.properties.name),
      ),
    );
    if (!owners.length) continue;
    features.push({
      ...feature,
      properties: {
        ...feature.properties,
        clientIds: owners.map((c) => c.id),
        clientNames: owners.map((c) => c.name),
        clientAliases: owners.flatMap((c) => c.aliases),
      },
    });
    for (const owner of owners) {
      const status = clients.find((c) => c.id === owner.id)!;
      status.territoryIds.push(feature.properties.id);
      status.missingRecords = status.missingRecords.filter(
        (name) => normalized(name) !== normalized(feature.properties.name),
      );
    }
  }
  for (const client of clients)
    client.status = !client.territoryIds.length
      ? "unavailable"
      : client.missingRecords.length
        ? "partial"
        : "mapped";
  return {
    utilities: { type: "FeatureCollection" as const, features },
    clients,
  };
}

/** A client with no boundaries yields an empty map; it never falls back to other clients. */
export function clientView(
  data: DashboardData | null,
  clientId: string,
): DashboardData | null {
  if (!data || !clientId) return data;
  const features = data.utilities.features.filter((f) =>
    f.properties.clientIds?.includes(clientId),
  );
  const ids = new Set(features.map((f) => f.properties.id));
  return {
    ...data,
    utilities: { ...data.utilities, features },
    assessments: data.assessments.filter((a) => ids.has(a.utilityId)),
  };
}
