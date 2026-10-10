import type { LayerSpecification } from "maplibre-gl";

export const DETAIL_SOURCE = "street-context";
export const DETAIL_TILEJSON = "https://tiles.openfreemap.org/planet";
export const DETAIL_GLYPHS =
  "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const DETAIL_ATTRIBUTION =
  '<a href="https://openfreemap.org/" target="_blank">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a> · <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a>';

/** Geographic context only. These roads/buildings are not verified grid assets. */
export function detailLayers(light: boolean): LayerSpecification[] {
  const source = DETAIL_SOURCE;
  return [
    {
      id: "detail-parks",
      type: "fill",
      source,
      "source-layer": "park",
      minzoom: 7,
      paint: {
        "fill-color": light ? "#c9dcc5" : "#1b3c37",
        "fill-opacity": 0.6,
      },
    },
    {
      id: "detail-water",
      type: "fill",
      source,
      "source-layer": "water",
      minzoom: 5,
      paint: { "fill-color": light ? "#b9d9e3" : "#0a2433" },
    },
    {
      id: "detail-waterways",
      type: "line",
      source,
      "source-layer": "waterway",
      minzoom: 8,
      paint: { "line-color": light ? "#91b9c9" : "#285062", "line-width": 1.2 },
    },
    {
      id: "detail-roads",
      type: "line",
      source,
      "source-layer": "transportation",
      minzoom: 6,
      filter: [
        "match",
        ["get", "class"],
        [
          "motorway",
          "trunk",
          "primary",
          "secondary",
          "tertiary",
          "minor",
          "service",
        ],
        true,
        false,
      ],
      paint: {
        "line-color": light ? "#a6a99d" : "#50616b",
        "line-opacity": 0.8,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6,
          0.35,
          12,
          1.2,
          16,
          3,
        ],
      },
    },
    {
      id: "detail-highways",
      type: "line",
      source,
      "source-layer": "transportation",
      minzoom: 5,
      filter: ["match", ["get", "class"], ["motorway", "trunk"], true, false],
      paint: {
        "line-color": light ? "#bc965c" : "#a58b60",
        "line-opacity": 0.8,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5,
          0.5,
          10,
          1.3,
          16,
          4,
        ],
      },
    },
    {
      id: "detail-buildings",
      type: "fill",
      source,
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-color": light ? "#adb7b6" : "#3a505b",
        "fill-opacity": 0.7,
      },
    },
    {
      id: "detail-city-labels",
      type: "symbol",
      source,
      "source-layer": "place",
      minzoom: 5,
      filter: [
        "match",
        ["get", "class"],
        ["city", "town", "village", "suburb"],
        true,
        false,
      ],
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10, 13, 13],
        "text-max-width": 9,
      },
      paint: {
        "text-color": light ? "#354552" : "#c8d7dc",
        "text-halo-color": light ? "#edf0e8" : "#102731",
        "text-halo-width": 1.4,
      },
    },
  ];
}
