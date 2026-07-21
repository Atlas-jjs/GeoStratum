/*
 * Converts GeoJSON coordinates from UTM (EPSG:32651) to WGS84 (EPSG:4326)
 * before rendering them on the map. Processes features in chunks to avoid
 * freezing the browser.
 */

proj4.defs(
  "EPSG:32651",
  "+proj=utm +zone=51 +ellps=WGS84 +datum=WGS84 +units=m +no_defs",
);

/*
 * Check if a GeoJSON dataset needs coordinate conversion from UTM to WGS84.
 * Detects by CRS metadata or by inspecting coordinate magnitude.
 */
export function shouldProject(geojson) {
  if (geojson.crs && geojson.crs.properties && geojson.crs.properties.name) {
    const name = geojson.crs.properties.name;
    if (name.includes("32651")) return true;
  }
  if (geojson.features && geojson.features.length > 0) {
    const firstFeature = geojson.features[0];
    if (firstFeature.geometry && firstFeature.geometry.coordinates) {
      const firstCoord = getFirstCoordinate(
        firstFeature.geometry.coordinates,
        firstFeature.geometry.type,
      );
      // UTM easting values for Zone 51N are typically 100,000–900,000 m
      if (firstCoord && firstCoord[0] > 180) {
        return true;
      }
    }
  }
  return false;
}

/* *
 * Convert EPSG:32651 coordinates to WGS84 in chunks to avoid freezing the UI.
 * @param {Array} features - GeoJSON features array
 * @param {Function} onDone - Callback when all features are projected
 * @param {Function} [onProgress] - Optional progress callback (percentage)
 */
export function projectFeaturesChunked(features, onDone, onProgress) {
  const total = features.length;
  const chunkSize = 250; // Process in chunks to prevent page freezing
  let index = 0;

  function process() {
    const end = Math.min(index + chunkSize, total);
    for (let i = index; i < end; i++) {
      projectFeature(features[i]);
    }
    index = end;

    if (onProgress) {
      onProgress(Math.round((index / total) * 100));
    }

    if (index < total) {
      setTimeout(process, 10);
    } else {
      onDone();
    }
  }

  process();
}

// ? === Internal Helpers ===
function projectFeature(feature) {
  if (feature && feature.geometry) {
    feature.geometry.coordinates = projectGeometryCoords(
      feature.geometry.coordinates,
      feature.geometry.type,
    );
  }
}

function projectGeometryCoords(coords, type) {
  if (type === "Point") {
    if (!coords || coords.length < 2) return coords;
    let p = proj4("EPSG:32651", "EPSG:4326", [coords[0], coords[1]]);
    return [p[0], p[1]];
  } else if (type === "LineString" || type === "MultiPoint") {
    return coords.map((c) => {
      let p = proj4("EPSG:32651", "EPSG:4326", [c[0], c[1]]);
      return [p[0], p[1]];
    });
  } else if (type === "Polygon" || type === "MultiLineString") {
    return coords.map((ring) =>
      ring.map((c) => {
        let p = proj4("EPSG:32651", "EPSG:4326", [c[0], c[1]]);
        return [p[0], p[1]];
      }),
    );
  } else if (type === "MultiPolygon") {
    return coords.map((polygon) =>
      polygon.map((ring) =>
        ring.map((c) => {
          let p = proj4("EPSG:32651", "EPSG:4326", [c[0], c[1]]);
          return [p[0], p[1]];
        }),
      ),
    );
  }
  return coords;
}

function getFirstCoordinate(coords, type) {
  if (type === "Point") return coords;
  if (type === "LineString" || type === "MultiPoint") return coords[0];
  if (type === "Polygon" || type === "MultiLineString") return coords[0][0];
  if (type === "MultiPolygon") return coords[0][0][0];
  return null;
}
