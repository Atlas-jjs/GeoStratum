import { AppState } from "../../base/config.js";

let highlightedFeature = null;

/* *
 * Get the currently highlighted feature layer reference.
 * @returns {L.Layer|null}
 */
export function getHighlightedFeature() {
  return highlightedFeature;
}

/* *
 * Clear the highlighted feature reference without resetting styles.
 * Use when the parent layer is being removed from the map.
 */
export function clearHighlightedFeature() {
  highlightedFeature = null;
}

/* *
 * Apply a gold highlight outline to a clicked map feature.
 * Resets any previously highlighted feature first.
 * @param {L.Layer} layer - The Leaflet layer to highlight
 */
export function highlightFeature(layer) {
  resetHighlightedFeatures();
  highlightedFeature = layer;
  layer.setStyle({
    weight: 3.5,
    color: "#fbbf24",
    fillOpacity: 0.1,
  });
}

/* *
 * Reset the previously highlighted feature to its original style.
 */
export function resetHighlightedFeatures() {
  if (highlightedFeature) {
    // Search built-in layers
    const key = Object.keys(AppState.layers).find(
      (k) =>
        AppState.layers[k].leafletLayer &&
        AppState.layers[k].leafletLayer.hasLayer(highlightedFeature),
    );
    if (key && AppState.layers[key]) {
      AppState.layers[key].leafletLayer.resetStyle(highlightedFeature);
    }
    highlightedFeature = null;
  }
}
