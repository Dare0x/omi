// Precomputes the dotted world map for the home page: one dot per 1.5° of land,
// tested against Natural Earth land (world-atlas, 1:110m). Output is tiny and static,
// so the page ships no map data and does no geometry at runtime.
import fs from "node:fs";
import path from "node:path";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

const land = JSON.parse(fs.readFileSync(path.join("node_modules", "world-atlas", "land-110m.json"), "utf8"));
const geo = feature(land, land.objects.land);
const STEP = 1.5;
const dots = [];
for (let lat = 78; lat >= -56; lat -= STEP)
  for (let lon = -180 + STEP / 2; lon < 180; lon += STEP) if (geoContains(geo, [lon, lat])) dots.push(Math.round(lon * 10), Math.round(lat * 10));
fs.mkdirSync(path.join("lib", "generated"), { recursive: true });
fs.writeFileSync(path.join("lib", "generated", "landDots.json"), JSON.stringify({ step: STEP, dots }));
console.log(`${dots.length / 2} land dots`);
