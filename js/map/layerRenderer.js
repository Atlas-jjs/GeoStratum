import { AppState } from "../config.js";
import { shouldProject, projectFeaturesChunked } from "../utils/projection.js";
import { getFeatureName } from "../utils/featureNaming.js";
import {
  highlightFeature,
  resetHighlightedFeatures,
} from "./featureHighlight.js";
import { showFeatureDetails } from "../components/ui/detailsPanel.js";
import { updateBoundaryAnalysis } from "../components/ui/details/boundaryAnalysis.js";

const layerPriority = {
  cad_municipality: 100,
  namria_municipality: 100,
  cad_province: 90,
  namria_province: 90,
  cad_boundary: 80,
  namria_boundary: 80,
};

// Helper for bounding box intersection
function doBboxesOverlap(bbox1, bbox2) {
  return !(
    bbox1[0] > bbox2[2] ||
    bbox1[2] < bbox2[0] ||
    bbox1[1] > bbox2[3] ||
    bbox1[3] < bbox2[1]
  );
}

// Spatial filtering and clipping using Turf.js
function getFeaturesWithinPolygon(geojson, boundaryFeature) {
  if (!geojson || !geojson.features) return geojson;
  if (!boundaryFeature) return geojson;

  let boundaryBbox;
  try {
    boundaryBbox = turf.bbox(boundaryFeature);
  } catch (e) {
    return geojson;
  }

  const filteredFeatures = [];

  for (let i = 0; i < geojson.features.length; i++) {
    const feature = geojson.features[i];
    if (!feature.geometry) continue;

    // 1. Fast Bounding Box overlap check
    let featureBbox;
    try {
      featureBbox = turf.bbox(feature);
    } catch (e) {
      filteredFeatures.push(feature);
      continue;
    }

    if (!doBboxesOverlap(boundaryBbox, featureBbox)) {
      continue;
    }

    // 2. Perform intersection/clipping
    const geomType = feature.geometry.type;
    if (geomType === "Point" || geomType === "MultiPoint") {
      try {
        if (turf.booleanPointInPolygon(feature, boundaryFeature)) {
          filteredFeatures.push(feature);
        }
      } catch (err) {
        filteredFeatures.push(feature);
      }
    } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
      try {
        const intersection = turf.intersect(feature, boundaryFeature);
        if (intersection) {
          intersection.properties = feature.properties;
          filteredFeatures.push(intersection);
        }
      } catch (err) {
        // Fallback: check if centroid is inside
        try {
          const centroid = turf.centroid(feature);
          if (turf.booleanPointInPolygon(centroid, boundaryFeature)) {
            filteredFeatures.push(feature);
          }
        } catch (e) {
          filteredFeatures.push(feature);
        }
      }
    } else if (geomType === "LineString" || geomType === "MultiLineString") {
      try {
        if (turf.booleanIntersects(feature, boundaryFeature)) {
          filteredFeatures.push(feature);
        }
      } catch (err) {
        filteredFeatures.push(feature);
      }
    } else {
      filteredFeatures.push(feature);
    }
  }

  return {
    type: "FeatureCollection",
    features: filteredFeatures,
  };
}

// Core layer keys that should NOT be re-rendered during selection changes
// (re-rendering them would destroy the selectedLayer/selectedBoundary references)
const CORE_LAYER_KEYS = new Set([
  "cad_boundary",
  "namria_boundary",
  "cad_province",
  "namria_province",
  "cad_municipality",
  "namria_municipality",
]);

// Re-renders all checked and loaded NON-CORE layers to reflect current selection clipping
export function reRenderAllCheckedLayers() {
  Object.keys(AppState.layers).forEach((key) => {
    const layerInfo = AppState.layers[key];
    if (layerInfo.checked && layerInfo.loaded && !CORE_LAYER_KEYS.has(key)) {
      renderGeoJSONLayer(key);
    }
  });
}

let _map = null;

/* *
 * Initialize the layer renderer with the Leaflet map instance.
 * @param {L.Map} map
 */
export function initLayerRenderer(map) {
  _map = map;

  // Initialize custom panes for z-ordering layers
  if (!map.getPane("polygonsPane")) {
    const pane = map.createPane("polygonsPane");
    pane.style.zIndex = 410;
  }
  if (!map.getPane("linesPane")) {
    const pane = map.createPane("linesPane");
    pane.style.zIndex = 420;
  }
  if (!map.getPane("pointsPane")) {
    const pane = map.createPane("pointsPane");
    pane.style.zIndex = 430;
  }

  // Handle clicking away on the map background to clear selection and restore levels
  map.on("click", () => {
    deselectCurrentBoundary();
  });
}

/* *
 * Load all layers that are checked by default in AppState.
 * Manages the page loader overlay dismissal.
 */
export function loadDefaultLayers() {
  const defaultKeys = Object.keys(AppState.layers).filter(
    (key) => AppState.layers[key].checked,
  );

  // Track how many layers still need to finish
  AppState.pendingLayerCount = defaultKeys.length;
  defaultKeys.forEach((key) => loadLayer(key));
}

/* *
 * Fetch and render a specific GeoJSON layer by key.
 * Projects coordinates if needed, shows loading spinner.
 * @param {string} key - Layer key from AppState.layers
 */
export function loadLayer(key) {
  const layerInfo = AppState.layers[key];
  if (!layerInfo) return;

  // Cache: data already fetched – just re-render with current selection state
  if (layerInfo.loaded && layerInfo.data) {
    renderGeoJSONLayer(key);
    if (AppState.selectedBoundary) {
      updateBoundaryAnalysis();
    }
    return;
  }

  const checkbox = document.getElementById(layerInfo.id);
  let stopLoader = () => {};

  if (checkbox) {
    const customCheckbox =
      checkbox.parentElement.querySelector(".checkbox-custom");
    const row = checkbox.closest(".control-checkbox");

    // ! Guard to prevent loading the spinner while it is already loading
    if (row.classList.contains("layer-loading")) return;

    const loader = document.createElement("div");
    loader.classList.add("layer-loader");
    checkbox.parentElement.insertBefore(loader, checkbox);
    checkbox.classList.add("hidden");
    customCheckbox.style.display = "none";
    row.classList.add("layer-loading");

    stopLoader = () => {
      loader.remove();
      checkbox.classList.remove("hidden");
      customCheckbox.style.display = "";
      row.classList.remove("layer-loading");
    };
  }

  // Construct the absolute path pointing directly to Hugging Face
  // const remoteUrl = `https://huggingface.co/datasets/Atlas-jjs/denr-geojson-data/resolve/main/${layerInfo.url}`;

  // fetch(remoteUrl)
  //   .then((res) => {
  //     if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${remoteUrl}`);
  //     return res.json();
  //   })
  //   .then((geojson) => {
  //     if (shouldProject(geojson)) {
  //       projectFeaturesChunked(geojson.features, () => {
  //         stopLoader();
  //         handleGeoJSONLoadSuccess(key, geojson);
  //       });
  //     } else {
  //       stopLoader();
  //       handleGeoJSONLoadSuccess(key, geojson);
  //     }
  //   })
  //   .catch((err) => {
  //     console.error(`Load failed for remote asset: ${remoteUrl}`, err);
  //     stopLoader();
  //     if (checkbox) {
  //       checkbox.checked = false;
  //     }
  //     layerInfo.checked = false;
  //     alert(
  //       `Failed to load ${layerInfo.name} layer from the remote Hugging Face dataset.`,
  //     );
  //   });

  const localUrl = layerInfo.url;

  fetch(localUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${localUrl}`);
      return res.json();
    })
    .then((geojson) => {
      if (shouldProject(geojson)) {
        projectFeaturesChunked(geojson.features, () => {
          stopLoader();
          handleGeoJSONLoadSuccess(key, geojson);
        });
      } else {
        stopLoader();
        handleGeoJSONLoadSuccess(key, geojson);
      }
    })
    .catch((err) => {
      console.error(`Load failed for local asset: ${localUrl}`, err);
      stopLoader();
      if (checkbox) {
        checkbox.checked = false;
      }
      layerInfo.checked = false;
      alert(
        `Failed to load ${layerInfo.name} layer from the local data folder.`,
      );
    });
}

// Internal Helpers

/* *
 * Handle successfully loaded and projected GeoJSON data.
 */
function handleGeoJSONLoadSuccess(key, geojson) {
  const layerInfo = AppState.layers[key];
  layerInfo.data = geojson;
  layerInfo.loaded = true;

  renderGeoJSONLayer(key);

  AppState.pendingLayerCount--;
  if (AppState.pendingLayerCount <= 0) {
    document.getElementById("page-loader").classList.add("hidden");
  }

  // Recalculate analysis if we have a selected boundary
  if (AppState.selectedBoundary) {
    updateBoundaryAnalysis();
  }
}

/* *
 * Calculates the median (50th percentile) area of polygon features in a layer.
 * Used to rank layers so that layers with overall smaller polygons sit on top.
 */
function calculateLayerMedianArea(layerInfo) {
  if (!layerInfo.data || !layerInfo.data.features) return 0;
  const polygonFeatures = layerInfo.data.features.filter(
    (f) =>
      f.geometry &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
  );
  if (polygonFeatures.length === 0) return 0;

  const areas = [];
  polygonFeatures.forEach((f) => {
    if (typeof turf !== "undefined" && turf.area) {
      try {
        const a = turf.area(f);
        if (a > 0) {
          areas.push(a);
        }
      } catch (e) {}
    }
  });

  if (areas.length === 0) return 0;
  areas.sort((a, b) => a - b);
  const mid = Math.floor(areas.length / 2);
  return areas.length % 2 !== 0
    ? areas[mid]
    : (areas[mid - 1] + areas[mid]) / 2;
}

/* *
 * Resets the style and clears references for the currently selected boundary,
 * then restores the polygon z-index sorting order.
 */
export function deselectCurrentBoundary() {
  if (!AppState.selectedBoundary) return;

  const key = AppState.selectedBoundary.layerKey;
  const layerInfo = AppState.layers[key];
  if (layerInfo) {
    if (layerInfo.selectedLayer && layerInfo.leafletLayer) {
      layerInfo.leafletLayer.resetStyle(layerInfo.selectedLayer);
    }
    layerInfo.selectedLayer = null;
  }

  AppState.selectedBoundary = null;
  resetHighlightedFeatures();

  const detailsPanel = document.getElementById("details-panel");
  if (detailsPanel) {
    detailsPanel.classList.add("hidden");
  }

  sortPolygonsInPane();
  reRenderAllCheckedLayers();
}

/* *
 * Sorts all polygon path elements in the polygonsPane SVG container:
 * 1. First by their layer's median area (largest median area layer on the bottom).
 * 2. Then within the same layer, by individual feature area (largest feature on the bottom).
 * This ensures the smallest polygon is painted last (renders on top) and the largest first.
 */
export function sortPolygonsInPane() {
  if (!_map) return;
  const pane = _map.getPane("polygonsPane");
  if (!pane) return;
  const svg = pane.querySelector("svg");
  if (!svg) return;

  const paths = Array.from(svg.querySelectorAll("path"));
  if (paths.length === 0) return;

  // Build a map of active layer keys to their median area
  const layerMedianAreas = {};
  Object.keys(AppState.layers).forEach((key) => {
    const layerInfo = AppState.layers[key];
    if (layerInfo.checked && layerInfo.loaded) {
      if (layerInfo.medianArea === undefined) {
        layerInfo.medianArea = calculateLayerMedianArea(layerInfo);
      }
      layerMedianAreas[key] = layerInfo.medianArea || 0;
    }
  });

  // Sort paths based on priority (to place core layers on top), then median area, then individual feature area
  paths.sort((a, b) => {
    const layerKeyA = a.getAttribute("data-layer-key") || "";
    const layerKeyB = b.getAttribute("data-layer-key") || "";

    const priorityA = layerPriority[layerKeyA] || 0;
    const priorityB = layerPriority[layerKeyB] || 0;

    if (priorityA !== priorityB) {
      return priorityA - priorityB; // Ascending: lower priority first (at bottom), higher priority last (on top)
    }

    const medianA = layerMedianAreas[layerKeyA] ?? 0;
    const medianB = layerMedianAreas[layerKeyB] ?? 0;

    if (medianA !== medianB) {
      return medianB - medianA; // Descending: larger median area layer first (at bottom)
    }

    // Same layer: sort by individual feature area
    const areaA = parseFloat(a.getAttribute("data-area") || "0");
    const areaB = parseFloat(b.getAttribute("data-area") || "0");
    return areaB - areaA; // Descending: larger individual feature area first (at bottom)
  });

  // Re-append paths to their parent to update their DOM order
  paths.forEach((path) => {
    const parent = path.parentNode;
    if (parent) {
      parent.appendChild(path);
    }
  });
}

/* *
 * Create and add a Leaflet GeoJSON layer with style and interactivity bindings.
 */
function renderGeoJSONLayer(key) {
  const layerInfo = AppState.layers[key];
  if (!layerInfo.data) return;

  if (layerInfo.leafletLayer && _map.hasLayer(layerInfo.leafletLayer)) {
    _map.removeLayer(layerInfo.leafletLayer);
  }

  let displayData = layerInfo.data;

  const isBoundaryProvinceOrMuni =
    AppState.selectedBoundary &&
    (AppState.selectedBoundary.layerKey === "cad_province" ||
      AppState.selectedBoundary.layerKey === "namria_province" ||
      AppState.selectedBoundary.layerKey === "cad_municipality" ||
      AppState.selectedBoundary.layerKey === "namria_municipality");

  if (isBoundaryProvinceOrMuni && !CORE_LAYER_KEYS.has(key)) {
    displayData = getFeaturesWithinPolygon(
      layerInfo.data,
      AppState.selectedBoundary.feature,
    );
  }

  layerInfo.leafletLayer = L.geoJSON(displayData, {
    style:
      layerInfo.colorField && layerInfo.codeColors
        ? (feature) => {
            const code = String(
              feature.properties?.[layerInfo.colorField] ?? "",
            );
            const color =
              layerInfo.codeColors[code] ?? layerInfo.style.fillColor;
            return { ...layerInfo.style, color, fillColor: color };
          }
        : layerInfo.style,
    onEachFeature: (feature, layer) => {
      // Assign custom panes based on geometry category to arrange points > lines > polygons
      const geomType = feature.geometry ? feature.geometry.type : null;
      if (geomType === "Point" || geomType === "MultiPoint") {
        layer.options.pane = "pointsPane";
      } else if (geomType === "LineString" || geomType === "MultiLineString") {
        layer.options.pane = "linesPane";
      } else if (geomType === "Polygon" || geomType === "MultiPolygon") {
        layer.options.pane = "polygonsPane";

        // Calculate polygon area using Turf.js
        let area = 0;
        if (typeof turf !== "undefined" && turf.area) {
          try {
            area = turf.area(feature);
          } catch (e) {
            area = 0;
          }
        }

        // Tag the DOM element with the area and layer key once the layer is added to the map
        layer.on("add", () => {
          const el = layer.getElement();
          if (el) {
            el.setAttribute("data-area", area);
            el.setAttribute("data-layer-key", key);
          }
        });
      }

      layer.on({
        mouseover: (e) => {
          const outline = e.target;

          // Does not override the selectedLayer when hovering other polygons
          if (outline === layerInfo.selectedLayer) return;

          outline.setStyle({
            weight: layerInfo.style.weight + 1,
            color: "#ffffff",
            fillOpacity: layerInfo.style.fillOpacity,
          });

          // Only bring to front on hover if it's NOT a polygon (e.g. lines, points)
          if (geomType !== "Polygon" && geomType !== "MultiPolygon") {
            outline.bringToFront();
          }

          let name = getFeatureName(feature.properties, key);
          if (name) {
            outline
              .bindTooltip(name, {
                sticky: true,
                className: "premium-tooltip",
              })
              .openTooltip();
          }
        },
        mouseout: (e) => {
          const outline = e.target;
          if (outline === layerInfo.selectedLayer) return;
          layerInfo.leafletLayer.resetStyle(outline);
          outline.closeTooltip();
        },
        click: (e) => {
          if (e.target.getBounds) {
            _map.fitBounds(e.target.getBounds());
          }

          // Deselect the previously selected boundary first to restore its level
          deselectCurrentBoundary();

          layerInfo.selectedLayer = e.target;

          // Save selected boundary in AppState!
          AppState.selectedBoundary = {
            feature: feature,
            layerKey: key,
            layerInfo: layerInfo,
          };

          highlightFeature(e.target);
          showFeatureDetails(feature.properties, layerInfo.name);

          // Re-render all checked layers to clip them to the selected boundary
          reRenderAllCheckedLayers();

          // Bring the newly selected polygon to the top of the polygonsPane
          if (geomType === "Polygon" || geomType === "MultiPolygon") {
            e.target.bringToFront();
          }

          L.DomEvent.stopPropagation(e);
        },
      });
    },
  });

  if (layerInfo.checked) {
    _map.addLayer(layerInfo.leafletLayer);
    sortPolygonsInPane();
  }
}
