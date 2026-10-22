import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { REGION_COUNT, REGION_INFO } from "./indiaRegions";
import "./india-map.css";

// Bundled from Highcharts Map Collection 2.3.3 (OpenStreetMap-derived, 36 admin-1 regions).
const INDIA_MAP_URL = "/maps/india-states.geo.json";
const VIEWBOX_WIDTH = 620;
const VIEWBOX_HEIGHT = 590;
const MAP_PADDING = 22;
const MAX_MERCATOR_LATITUDE = 85.05112878;

type Coordinate = [number, number];
type Ring = Coordinate[];
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

type IndiaFeature = {
  type: "Feature";
  properties: { name: string };
  geometry: Geometry;
};

type IndiaFeatureCollection = {
  type: "FeatureCollection";
  features: IndiaFeature[];
};

type MapStatus = "loading" | "ready" | "error";

const REGION_NAMES = Object.keys(REGION_INFO);
const REGION_NAME_SET = new Set(REGION_NAMES);

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function isClosedRing(value: unknown): value is Ring {
  // The source map contains a few tiny island slivers encoded as three-position
  // closed rings (A, B, A). Keep them so the feature remains represented and
  // selectable through the region picker instead of rejecting the whole map.
  if (!Array.isArray(value) || value.length < 3 || !value.every(isCoordinate))
    return false;
  const first = value[0];
  const last = value[value.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function isGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  if (geometry.type === "Polygon") {
    return (
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length > 0 &&
      geometry.coordinates.every(isClosedRing)
    );
  }
  if (geometry.type === "MultiPolygon") {
    return (
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length > 0 &&
      geometry.coordinates.every(
        (polygon) =>
          Array.isArray(polygon) &&
          polygon.length > 0 &&
          polygon.every(isClosedRing),
      )
    );
  }
  return false;
}

function isFeature(value: unknown): value is IndiaFeature {
  if (!value || typeof value !== "object") return false;
  const feature = value as {
    type?: unknown;
    properties?: { name?: unknown };
    geometry?: unknown;
  };
  return (
    feature.type === "Feature" &&
    typeof feature.properties?.name === "string" &&
    REGION_NAME_SET.has(feature.properties.name) &&
    isGeometry(feature.geometry)
  );
}

function validateFeatureCollection(value: unknown): IndiaFeatureCollection {
  if (!value || typeof value !== "object")
    throw new Error("Boundary data is not an object.");
  const collection = value as { type?: unknown; features?: unknown };
  if (
    collection.type !== "FeatureCollection" ||
    !Array.isArray(collection.features)
  ) {
    throw new Error("Boundary data is not a GeoJSON FeatureCollection.");
  }
  if (
    collection.features.length !== REGION_COUNT ||
    !collection.features.every(isFeature)
  ) {
    throw new Error(
      `Boundary data does not contain the expected ${REGION_COUNT} valid regions.`,
    );
  }

  const names = collection.features.map((feature) => feature.properties.name);
  const uniqueNames = new Set(names);
  if (
    uniqueNames.size !== REGION_NAMES.length ||
    names.some((name) => !REGION_NAME_SET.has(name))
  ) {
    throw new Error(
      "Boundary data has duplicate, missing, or unknown region names.",
    );
  }
  if (REGION_NAMES.some((name) => !uniqueNames.has(name))) {
    throw new Error("Boundary data does not cover every metadata region.");
  }

  return { type: "FeatureCollection", features: collection.features };
}

function allRings(geometry: Geometry): Ring[] {
  return geometry.type === "Polygon"
    ? geometry.coordinates
    : geometry.coordinates.flat();
}

function mercatorPoint([longitude, latitude]: Coordinate): Coordinate {
  const safeLatitude = Math.max(
    -MAX_MERCATOR_LATITUDE,
    Math.min(MAX_MERCATOR_LATITUDE, latitude),
  );
  const radians = (safeLatitude * Math.PI) / 180;
  // Both axes must use radians-based Mercator units before uniform fitting.
  // Leaving longitude in degrees compresses the map vertically by ~57.3x.
  return [
    (longitude * Math.PI) / 180,
    Math.log(Math.tan(Math.PI / 4 + radians / 2)),
  ];
}

function createProjector(features: IndiaFeature[]) {
  const projectedPoints = features.flatMap((feature) =>
    allRings(feature.geometry).flatMap((ring) => ring.map(mercatorPoint)),
  );
  const xValues = projectedPoints.map(([x]) => x);
  const yValues = projectedPoints.map(([, y]) => y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xSpan = Math.max(maxX - minX, Number.EPSILON);
  const ySpan = Math.max(maxY - minY, Number.EPSILON);
  const scale = Math.min(
    (VIEWBOX_WIDTH - MAP_PADDING * 2) / xSpan,
    (VIEWBOX_HEIGHT - MAP_PADDING * 2) / ySpan,
  );
  const renderedWidth = xSpan * scale;
  const renderedHeight = ySpan * scale;
  const offsetX = (VIEWBOX_WIDTH - renderedWidth) / 2;
  const offsetY = (VIEWBOX_HEIGHT - renderedHeight) / 2;

  return (point: Coordinate): Coordinate => {
    const [x, y] = mercatorPoint(point);
    return [offsetX + (x - minX) * scale, offsetY + (maxY - y) * scale];
  };
}

function pathFromRing(
  ring: Ring,
  project: (point: Coordinate) => Coordinate,
): string {
  return `${ring
    .map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ")} Z`;
}

function pathFromGeometry(
  geometry: Geometry,
  project: (point: Coordinate) => Coordinate,
): string {
  return allRings(geometry)
    .map((ring) => pathFromRing(ring, project))
    .join(" ");
}

function RegionPath({
  feature,
  path,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  feature: IndiaFeature;
  path: string;
  selected: boolean;
  hovered: boolean;
  onSelect: (name: string) => void;
  onHover: (name: string | null) => void;
}) {
  const name = feature.properties.name;
  const info = REGION_INFO[name];
  const activate = () => onSelect(name);
  const handleKeyDown = (event: KeyboardEvent<SVGPathElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  };

  return (
    <path
      className={`india-map-region${selected ? " is-selected" : ""}${hovered ? " is-hovered" : ""}`}
      d={path}
      fillRule="evenodd"
      role="button"
      tabIndex={0}
      aria-label={`${info.officialName}, ${info.kind}, capital ${info.capital}`}
      aria-pressed={selected}
      onClick={activate}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onHover(name)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(name)}
      onBlur={() => onHover(null)}
    />
  );
}

export default function IndiaMap() {
  const [features, setFeatures] = useState<IndiaFeature[]>([]);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(INDIA_MAP_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Boundary data request failed: ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then((data) => {
        const collection = validateFeatureCollection(data);
        setFeatures(collection.features);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") {
          setFeatures([]);
          setSelectedName(null);
          setStatus("error");
        }
      });
    return () => controller.abort();
  }, [requestVersion]);

  const projectedFeatures = useMemo(() => {
    if (status !== "ready" || !features.length) return [];
    const project = createProjector(features);
    return features.map((feature) => ({
      feature,
      path: pathFromGeometry(feature.geometry, project),
    }));
  }, [features, status]);

  const selectedRegion = selectedName ? REGION_INFO[selectedName] : undefined;
  const hoveredRegion = hoveredName ? REGION_INFO[hoveredName] : undefined;
  const selectRegion = useCallback((name: string) => {
    setSelectedName((current) => (current === name ? null : name));
    setHoveredName(null);
  }, []);
  const retry = () => {
    setStatus("loading");
    setRequestVersion((version) => version + 1);
  };
  const statusLabel =
    status === "loading"
      ? "Loading India’s administrative boundaries…"
      : "The map boundary data could not be loaded or validated.";

  return (
    <div className="india-map" data-map-status={status}>
      <div className="india-map-topline">
        <span className="india-map-kicker">
          36 regions · one living archive
        </span>
        <span className="india-map-source-label">
          States + union territories
        </span>
      </div>
      <div className="india-map-stage">
        <div className="india-map-canvas">
          {status === "ready" ? (
            <svg
              className="india-map-svg"
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              role="group"
              aria-label="Interactive map of India with all 28 states and 8 union territories"
            >
              <title>Interactive map of India</title>
              <desc>
                Choose a state or union territory to view its official name and
                capital.
              </desc>
              {projectedFeatures.map(({ feature, path }) => {
                const name = feature.properties.name;
                return (
                  <RegionPath
                    key={name}
                    feature={feature}
                    path={path}
                    selected={selectedName === name}
                    hovered={hoveredName === name}
                    onSelect={selectRegion}
                    onHover={setHoveredName}
                  />
                );
              })}
            </svg>
          ) : (
            <div className="india-map-status" role="status" aria-live="polite">
              <span>{statusLabel}</span>
              {status === "error" && (
                <button type="button" onClick={retry}>
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
        <div
          className={`india-map-info${selectedRegion ? " has-selection" : ""}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {selectedRegion ? (
            <>
              <span className="india-map-info-kind">{selectedRegion.kind}</span>
              <strong>{selectedRegion.officialName}</strong>
              <span className="india-map-capital-label">Capital</span>
              <span className="india-map-capital">
                {selectedRegion.capital}
              </span>
              <button
                type="button"
                className="india-map-close"
                onClick={() => setSelectedName(null)}
              >
                Close <span aria-hidden="true">×</span>
              </button>
            </>
          ) : (
            <>
              <span className="india-map-info-kind">
                {hoveredRegion ? hoveredRegion.kind : "Explore India"}
              </span>
              <strong>
                {hoveredRegion ? hoveredRegion.officialName : "Select a region"}
              </strong>
            </>
          )}
        </div>
      </div>
      <div className="india-map-picker">
        <label htmlFor="india-region-select">Choose a region</label>
        <select
          id="india-region-select"
          value={selectedName || ""}
          onChange={(event) => setSelectedName(event.target.value || null)}
          disabled={status !== "ready"}
        >
          <option value="">Select a state or union territory</option>
          {REGION_NAMES.map((name) => (
            <option key={name} value={name}>
              {REGION_INFO[name].officialName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
