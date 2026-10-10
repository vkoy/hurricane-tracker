import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";
const world = JSON.parse(
  readFileSync("node_modules/world-atlas/countries-50m.json", "utf8"),
);
const us = JSON.parse(
  readFileSync("node_modules/us-atlas/states-10m.json", "utf8"),
);
mkdirSync("public/geo", { recursive: true });
writeFileSync(
  "public/geo/countries.json",
  JSON.stringify(feature(world, world.objects.countries)),
);
writeFileSync(
  "public/geo/states.json",
  JSON.stringify(feature(us, us.objects.states)),
);
console.log("Prepared Natural Earth land and Census-derived state boundaries.");
