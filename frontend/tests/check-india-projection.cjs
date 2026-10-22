const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the actual component's geometry functions, not a second projection.
const source = fs.readFileSync(
  "src/sections/Integrations/IndiaMap.tsx",
  "utf8",
);
const geometry = source.slice(
  source.indexOf("function allRings("),
  source.indexOf("function RegionPath("),
);
const context = vm.createContext({});
vm.runInContext(
  ts.transpileModule(
    "const VIEWBOX_WIDTH=620, VIEWBOX_HEIGHT=590, MAP_PADDING=22, MAX_MERCATOR_LATITUDE=85.05112878;\n" +
      geometry,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText,
  context,
);
const { features } = JSON.parse(
  fs.readFileSync("public/maps/india-states.geo.json", "utf8"),
);
const ladakh = features.find((f) => f.properties.name === "Ladakh");
assert(ladakh, "Ladakh must remain a first-class mapped region");
const ladakhCoordinates = context.allRings(ladakh.geometry).flat();
assert(
  Math.max(...ladakhCoordinates.map((p) => p[1])) > 35.5,
  "Ladakh northern boundary must remain in the source geometry",
);
const project = context.createProjector(features);
const points = features.flatMap((f) =>
  context.allRings(f.geometry).flatMap((r) => r.map(project)),
);
const xs = points.map((p) => p[0]),
  ys = points.map((p) => p[1]);
const bounds = {
  x: Math.min(...xs),
  y: Math.min(...ys),
  width: Math.max(...xs) - Math.min(...xs),
  height: Math.max(...ys) - Math.min(...ys),
};
assert(points.every((p) => p.every(Number.isFinite)));
assert(
  bounds.width > 450 && bounds.height > 500,
  "India must occupy both axes, not form a horizontal strip",
);
assert(
  bounds.width / bounds.height > 0.8 && bounds.width / bounds.height < 1.05,
  "Mercator axes must use consistent units",
);
assert(Math.abs(bounds.x + bounds.width / 2 - 310) < 0.001);
assert(Math.abs(bounds.y + bounds.height / 2 - 295) < 0.001);
assert(
  bounds.x >= 22 &&
    bounds.y >= 22 &&
    bounds.x + bounds.width <= 598 &&
    bounds.y + bounds.height <= 568,
);
assert(
  project([80, 30])[1] < project([80, 10])[1],
  "North must be above south",
);
assert(
  features.every(
    (f) => context.pathFromGeometry(f.geometry, project).length > 0,
  ),
);
console.log(
  "PASS: 36-region projection is upright, proportionate, centered, and inside the viewBox.",
  bounds,
);
