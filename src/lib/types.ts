import type {
  Feature,
  FeatureCollection,
  Point,
  LineString,
  Polygon,
  MultiPolygon,
} from "geojson";

export type Area = Polygon | MultiPolygon;
export type FeedState =
  "live" | "stale" | "partial" | "archived" | "unavailable" | "not-configured";
export type Risk = "Low" | "Moderate" | "High" | "Very high" | "Extreme";
export type LayerKey =
  | "tracks"
  | "cones"
  | "wind"
  | "surge"
  | "utilities"
  | "impact"
  | "transmission"
  | "substations"
  | "outages"
  | "population"
  | "critical";
export interface SourceStatus {
  id: string;
  name: string;
  state: FeedState;
  url: string;
  attribution: string;
  fetchedAt: string | null;
  issuedAt: string | null;
  refreshMinutes: number;
  message: string;
  license: string;
}
export interface Storm {
  id: string;
  name: string;
  classification: string;
  latitude: number;
  longitude: number;
  windKnots: number | null;
  pressureMb: number | null;
  movement: string | null;
  movementSpeedKnots?: number | null;
  binNumber?: string;
  windValidAt?: string | null;
  category?: number | null;
  issuedAt: string | null;
  advisoryUrl: string;
  color: string;
}
export interface StormProperties {
  stormId: string;
  name: string;
  kind: "observed" | "forecast" | "cone" | "wind";
  validAt: string | null;
  issuedAt: string | null;
  windKnots: number | null;
  sourceUrl: string;
  color: string;
  movementSpeedKnots?: number | null;
  category?: number | null;
}
export interface UtilityProperties {
  id: string;
  name: string;
  state: string;
  type: string;
  customers: number | null;
  website: string | null;
  sourceUrl: string;
  sourceDate: string | null;
  city?: string;
  customerYear?: string | null;
  boundarySource?: string;
  geometryProcessing?: string;
}
export interface UtilityCoverage {
  sourceRecordCount: number;
  includedCount: number;
  normalizedCount: number;
  excluded: { id: string; name: string; reason: string }[];
}
export type UtilityFeature = Feature<Area, UtilityProperties>;
export type HazardFeature = Feature<Area, StormProperties>;
export interface StormGeometry {
  tracks: FeatureCollection<LineString, StormProperties>;
  points: FeatureCollection<Point, StormProperties>;
  cones: FeatureCollection<Area, StormProperties>;
  wind: FeatureCollection<Area, StormProperties>;
}
export type FactorKey =
  | "wind"
  | "territory"
  | "customers"
  | "infrastructure"
  | "surge"
  | "uncertainty";
export type Weights = Record<FactorKey, number>;
export interface Factor {
  key: FactorKey;
  label: string;
  weight: number;
  value: number | null;
  explanation: string;
}
export interface Assessment {
  utilityId: string;
  stormId: string;
  score: number | null;
  risk: Risk | null;
  completeness: number;
  confidence: "Limited" | "Moderate" | "High";
  territoryPercent: number | null;
  conePercent: number | null;
  windKnots: number | null;
  customersExposed: number | null;
  assetsExposed: number | null;
  reportedOutages: number | null;
  factors: Factor[];
  explanation: string;
  computedAt: string;
}
export interface DashboardData {
  storms: Storm[];
  geometry: StormGeometry;
  utilities: FeatureCollection<Area, UtilityProperties>;
  assessments: Assessment[];
  sources: SourceStatus[];
  fetchedAt: string;
  forecastTimes: string[];
  weights: Weights;
  utilityCoverage?: UtilityCoverage;
}
export const emptyCollection = <
  G extends import("geojson").Geometry,
  P = Record<string, unknown>,
>(): FeatureCollection<G, P> => ({ type: "FeatureCollection", features: [] });
export const RISK_COLORS: Record<Risk, string> = {
  Low: "#45ca99",
  Moderate: "#e6cb65",
  High: "#fa9a53",
  "Very high": "#f26971",
  Extreme: "#b78afa",
};
