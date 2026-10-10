"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapInstance } from "maplibre-gl";
import { bbox, centroid } from "@turf/turf";
import {
  Compass,
  Crosshair,
  Minus,
  Plus,
  Expand,
  Map as MapIcon,
  LocateFixed,
} from "lucide-react";
import type { DashboardData, LayerKey, UtilityFeature } from "@/lib/types";
import { RISK_COLORS } from "@/lib/types";
import { utilityAssessment } from "@/lib/selection";

interface Props {
  data: DashboardData | null;
  layers: Record<LayerKey, boolean>;
  stormId: string;
  selectedUtility: string | null;
  onUtility: (id: string) => void;
  onStorm: (id: string) => void;
  validAt: string | null;
  light: boolean;
}
const EMPTY = { type: "FeatureCollection" as const, features: [] };
const places: [string, number, number, string][] = [
  ["UNITED STATES", -101, 39, "country"],
  ["MEXICO", -104, 25, "country"],
  ["CANADA", -103, 52, "country"],
  ["GULF OF MEXICO", -89, 24, "ocean"],
  ["ATLANTIC OCEAN", -64, 34, "ocean"],
  ["CARIBBEAN SEA", -75, 16, "ocean"],
  ["CUBA", -79, 21.7, "region"],
  ["BAHAMAS", -75.7, 24.1, "region"],
  ["PUERTO RICO", -66.3, 18.3, "region"],
  ["Houston", -95.37, 29.76, "city"],
  ["New Orleans", -90.07, 29.95, "city"],
  ["Miami", -80.19, 25.76, "city"],
  ["Tampa", -82.46, 27.95, "city"],
  ["Jacksonville", -81.66, 30.33, "city"],
  ["Atlanta", -84.39, 33.75, "city"],
  ["Charleston", -79.93, 32.78, "city"],
  ["Raleigh", -78.64, 35.78, "city"],
  ["New York", -74.01, 40.71, "city"],
  ["Washington", -77.04, 38.91, "city"],
  ["Boston", -71.06, 42.36, "city"],
  ["Dallas", -96.8, 32.78, "city"],
  ["Chicago", -87.63, 41.88, "city"],
  ["Los Angeles", -118.24, 34.05, "city"],
  ["Seattle", -122.33, 47.61, "city"],
  ["Denver", -104.99, 39.74, "city"],
  ["San Juan", -66.11, 18.47, "city"],
];
const visibleLayers: Record<string, LayerKey> = {
  "observed-track": "tracks",
  "forecast-track": "tracks",
  "forecast-points": "tracks",
  "cone-fill": "cones",
  "cone-outline": "cones",
  "wind-fill": "wind",
  "wind-outline": "wind",
  "utility-base": "utilities",
  "utility-boundary": "utilities",
  "impact-fill": "impact",
};

export default function StormMap({
  data,
  layers,
  stormId,
  selectedUtility,
  onUtility,
  onStorm,
  validAt,
  light,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const callbacks = useRef({ onUtility, onStorm });
  callbacks.current = { onUtility, onStorm };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [idle, setIdle] = useState(false);
  const [featuresReady, setFeaturesReady] = useState(false);
  const [coordinates, setCoordinates] = useState("29.80° N   87.50° W");
  const [mapStyle, setMapStyle] = useState<"standard" | "contrast">("standard");
  const stormMarkers = useRef<maplibregl.Marker[]>([]);
  const utilityMarkers = useRef<maplibregl.Marker[]>([]);
  const lastFocusedUtility = useRef<string | null>(null);

  useEffect(() => {
    if (!container.current) return;
    let map: MapInstance;
    try {
      maplibregl.setWorkerUrl(
        `/vendor/maplibre-gl-worker.mjs?v=${maplibregl.getVersion()}`,
      );
      map = new maplibregl.Map({
        container: container.current,
        center: [-98, 32],
        zoom: 3.35,
        minZoom: 1.5,
        maxZoom: 13,
        attributionControl: { compact: true },
        renderWorldCopies: false,
        style: {
          version: 8,
          sources: {
            land: {
              type: "geojson",
              data: "/geo/countries.json",
              attribution: "Natural Earth · public domain",
            },
            states: {
              type: "geojson",
              data: "/geo/states.json",
              attribution: "U.S. Census Bureau / us-atlas",
            },
          },
          layers: [
            {
              id: "ocean",
              type: "background",
              paint: { "background-color": "#081b29" },
            },
            {
              id: "land",
              type: "fill",
              source: "land",
              paint: { "fill-color": "#142d38" },
            },
            {
              id: "coast",
              type: "line",
              source: "land",
              paint: { "line-color": "#365563", "line-width": 1 },
            },
            {
              id: "states",
              type: "line",
              source: "states",
              paint: { "line-color": "#2c4756", "line-width": 0.65 },
            },
          ],
        },
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.on("movestart", () => setIdle(false));
    map.on("idle", () => {
      setIdle(true);
      if (map.getSource("utilities") && map.isSourceLoaded("utilities"))
        setFeaturesReady(true);
    });
    map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: "imperial" }),
      "bottom-left",
    );
    const placeMarkers = places.map(([name, lon, lat, kind]) => {
      const el = document.createElement("div");
      el.className = `place-label ${kind}`;
      el.textContent = name;
      return new maplibregl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);
    });
    map.on("load", () => {
      const grid = [];
      for (let x = -180; x <= -20; x += 10)
        grid.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [x, 5],
              [x, 75],
            ],
          },
          properties: {},
        });
      for (let y = 10; y <= 70; y += 10)
        grid.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [-180, y],
              [-20, y],
            ],
          },
          properties: {},
        });
      map.addSource("graticule", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: grid,
        } as GeoJSON.FeatureCollection,
      });
      map.addLayer({
        id: "graticule",
        source: "graticule",
        type: "line",
        paint: {
          "line-color": "#6494a5",
          "line-opacity": 0.07,
          "line-width": 0.6,
        },
      });
      for (const id of ["utilities", "tracks", "points", "cones", "wind"])
        map.addSource(id, { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "utility-base",
        source: "utilities",
        type: "fill",
        paint: { "fill-color": "#70bcb2", "fill-opacity": 0.09 },
      });
      map.addLayer({
        id: "impact-fill",
        source: "utilities",
        type: "fill",
        paint: {
          "fill-color": ["coalesce", ["get", "riskColor"], "#637887"],
          "fill-opacity": ["case", ["has", "riskColor"], 0.38, 0.02],
        },
      });
      map.addLayer({
        id: "utility-boundary",
        source: "utilities",
        type: "line",
        paint: {
          "line-color": "#6caaa7",
          "line-width": 1,
          "line-opacity": 0.7,
        },
      });
      map.addLayer({
        id: "utility-hit",
        source: "utilities",
        type: "fill",
        paint: { "fill-opacity": 0 },
      });
      map.addLayer({
        id: "utility-selected",
        source: "utilities",
        type: "line",
        filter: ["==", ["get", "id"], ""],
        paint: { "line-color": "#96f1d6", "line-width": 3 },
      });
      map.addLayer({
        id: "cone-fill",
        source: "cones",
        type: "fill",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.13 },
      });
      map.addLayer({
        id: "cone-outline",
        source: "cones",
        type: "line",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1.5,
          "line-dasharray": [4, 3],
          "line-opacity": 0.65,
        },
      });
      map.addLayer({
        id: "wind-fill",
        source: "wind",
        type: "fill",
        paint: { "fill-color": "#e6ba63", "fill-opacity": 0.13 },
      });
      map.addLayer({
        id: "wind-outline",
        source: "wind",
        type: "line",
        paint: {
          "line-color": "#e6ba63",
          "line-width": 1,
          "line-opacity": 0.6,
        },
      });
      map.addLayer({
        id: "observed-track",
        source: "tracks",
        type: "line",
        filter: ["==", ["get", "kind"], "observed"],
        paint: { "line-color": ["get", "color"], "line-width": 3 },
      });
      map.addLayer({
        id: "forecast-track",
        source: "tracks",
        type: "line",
        filter: ["==", ["get", "kind"], "forecast"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 2.5,
          "line-dasharray": [3, 2],
        },
      });
      map.addLayer({
        id: "forecast-points",
        source: "points",
        type: "circle",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": 4,
          "circle-stroke-color": "#eaf2ff",
          "circle-stroke-width": 1.5,
        },
      });
      map.on("click", "utility-hit", (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) callbacks.current.onUtility(String(id));
      });
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
      });
      map.on("mousemove", "utility-hit", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const p = e.features?.[0]?.properties;
        if (p)
          popup
            .setLngLat(e.lngLat)
            .setText(
              `${p.name}${p.score !== null && p.score !== undefined ? ` · Exposure ${p.score}/100` : " · Not assessed"}`,
            )
            .addTo(map);
      });
      map.on("mouseleave", "utility-hit", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });
      map.on("click", "forecast-points", (e) => {
        const p = e.features?.[0]?.properties;
        if (p)
          new maplibregl.Popup()
            .setLngLat(e.lngLat)
            .setText(
              `${p.name} · ${p.kind} · Valid: ${p.validAt || "unavailable"} · ${p.windKnots ?? "—"} kt`,
            )
            .addTo(map);
      });
      setReady(true);
    });
    map.on("mousemove", (e) =>
      setCoordinates(
        `${Math.abs(e.lngLat.lat).toFixed(2)}° ${e.lngLat.lat >= 0 ? "N" : "S"}   ${Math.abs(e.lngLat.lng).toFixed(2)}° ${e.lngLat.lng >= 0 ? "E" : "W"}`,
      ),
    );
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      placeMarkers.forEach((m) => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !data) return;
    const geometry = data.geometry;
    setFeaturesReady(false);
    for (const name of ["tracks", "points", "cones", "wind"] as const) {
      const fc = geometry[name];
      const filtered = {
        ...fc,
        features: fc.features.filter(
          (f) =>
            (!stormId || f.properties.stormId === stormId) &&
            (name !== "points" ||
              !validAt ||
              !f.properties.validAt ||
              f.properties.validAt <= validAt),
        ),
      };
      (map.getSource(name) as GeoJSONSource).setData(
        filtered as GeoJSON.FeatureCollection,
      );
    }
    const utilities = {
      ...data.utilities,
      features: data.utilities.features.map((f) => {
        const assessment = utilityAssessment(data, f.properties.id, stormId);
        return {
          ...f,
          properties: {
            ...f.properties,
            score: assessment?.score ?? null,
            ...(assessment?.risk
              ? { riskColor: RISK_COLORS[assessment.risk] }
              : {}),
          },
        };
      }),
    };
    (map.getSource("utilities") as GeoJSONSource).setData(utilities);
    stormMarkers.current.forEach((m) => m.remove());
    stormMarkers.current = layers.tracks
      ? data.storms
          .filter((s) => !stormId || s.id === stormId)
          .map((storm) => {
            const button = document.createElement("button");
            button.className = "storm-marker";
            button.style.setProperty("--storm-color", storm.color);
            button.setAttribute("aria-label", `Select ${storm.name}`);
            const icon = document.createElement("span");
            icon.className = "cyclone";
            icon.textContent = "◉";
            const label = document.createElement("span");
            label.textContent = storm.name;
            button.append(icon, label);
            button.onclick = () => callbacks.current.onStorm(storm.id);
            return new maplibregl.Marker({ element: button })
              .setLngLat([storm.longitude, storm.latitude])
              .addTo(map);
          })
      : [];
    utilityMarkers.current.forEach((m) => m.remove());
    const updateLabels = () => {
      utilityMarkers.current.forEach((m) => m.remove());
      utilityMarkers.current = [];
      if (map.getZoom() < 6 || !layers.utilities) return;
      for (const utility of data.utilities.features) {
        if (utilityMarkers.current.length >= 40) break;
        const point = centroid(utility).geometry.coordinates as [
          number,
          number,
        ];
        if (!map.getBounds().contains(point)) continue;
        const el = document.createElement("button");
        el.className = "utility-map-label";
        el.textContent = utility.properties.name;
        el.onclick = () => callbacks.current.onUtility(utility.properties.id);
        utilityMarkers.current.push(
          new maplibregl.Marker({ element: el }).setLngLat(point).addTo(map),
        );
      }
    };
    updateLabels();
    map.on("moveend", updateLabels);
    return () => {
      map.off("moveend", updateLabels);
    };
  }, [data, ready, stormId, validAt, layers.tracks, layers.utilities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const [id, key] of Object.entries(visibleLayers))
      map.setLayoutProperty(id, "visibility", layers[key] ? "visible" : "none");
    map.setLayoutProperty(
      "utility-hit",
      "visibility",
      layers.utilities || layers.impact ? "visible" : "none",
    );
  }, [layers, ready]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setFilter("utility-selected", [
      "==",
      ["get", "id"],
      selectedUtility || "",
    ]);
    const feature = data?.utilities.features.find(
      (f) => f.properties.id === selectedUtility,
    );
    if(!selectedUtility) lastFocusedUtility.current=null;
    if (feature && lastFocusedUtility.current!==selectedUtility) {
      lastFocusedUtility.current=selectedUtility;
      const b = bbox(feature);
      map.fitBounds(
        [
          [b[0], b[1]],
          [b[2], b[3]],
        ],
        { padding: 80, maxZoom: 8, duration: 1100 },
      );
    }
  }, [selectedUtility, ready, data]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPaintProperty(
      "ocean",
      "background-color",
      light ? "#cbdde0" : mapStyle === "contrast" ? "#07121b" : "#081b29",
    );
    map.setPaintProperty(
      "land",
      "fill-color",
      light ? "#e6e9df" : mapStyle === "contrast" ? "#253f48" : "#142d38",
    );
  }, [light, mapStyle, ready]);

  return (
    <div
      className="map-shell"
      data-testid="map-shell"
      data-map-idle={idle}
      data-features-ready={featuresReady}
    >
      <div
        className="map-canvas"
        ref={container}
        aria-label="Interactive United States storm and electric utility map"
      />
      {!ready && (
        <div className="map-loading">
          <MapIcon size={24} />
          <span>
            {failed
              ? "WebGL is unavailable in this browser. Data panels remain accessible."
              : "Preparing geographic layers…"}
          </span>
        </div>
      )}
      <div className="map-location">
        <span className="map-live-dot" />
        <span>U.S. & TROPICAL BASINS</span>
        <span className="map-location-divider" />
        <span>
          {!featuresReady && data?.utilities.features.length
            ? "Drawing territories…"
            : "Operational view"}
        </span>
      </div>
      <div className="map-controls">
        <button aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
          <Plus size={18} />
        </button>
        <button aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
          <Minus size={18} />
        </button>
        <span />
        <button
          aria-label="Reset north"
          onClick={() => mapRef.current?.resetNorth()}
        >
          <Compass size={19} />
        </button>
        <button
          aria-label="Fit United States"
          onClick={() =>
            mapRef.current?.fitBounds(
              [
                [-127, 23],
                [-65, 50],
              ],
              { padding: 35, duration: 1000 },
            )
          }
        >
          <Expand size={17} />
        </button>
        <button
          aria-label="Focus selected storm"
          disabled={!data?.storms.length}
          onClick={() => {
            const s =
              data?.storms.find((s) => s.id === stormId) || data?.storms[0];
            if (s)
              mapRef.current?.flyTo({
                center: [s.longitude, s.latitude],
                zoom: 5,
              });
          }}
        >
          <Crosshair size={18} />
        </button>
      </div>
      <div className="map-bottom">
        <button
          className="basemap-button"
          onClick={() =>
            setMapStyle((s) => (s === "standard" ? "contrast" : "standard"))
          }
        >
          <span className="mini-map">
            <MapIcon size={19} />
          </span>
          <span>
            BASEMAP
            <b>{mapStyle === "standard" ? "Dark terrain" : "High contrast"}</b>
          </span>
        </button>
        <span className="coordinates">
          <LocateFixed size={12} />
          {coordinates}
        </span>
      </div>
    </div>
  );
}
