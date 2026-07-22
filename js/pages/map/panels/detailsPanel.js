import { getFeatureName } from "../../../shared/utils/featureNaming.js";
import { AppState } from "../../../base/config.js";
import { updateBoundaryAnalysis } from "./details/boundaryAnalysis.js";
import {
  normalizeAttributeKey,
  shouldHideAttribute,
  dedupeByBaseKey,
  isEmptyValue,
} from "./details/attributeUtils.js";
import {
  formatKeyLabel,
  formatAttributeValue,
} from "./details/attributeFormatting.js";

/* *
 * Render dynamic attributes inside the floating details panel.
 * @param {Object} properties - GeoJSON feature properties
 * @param {string} layerName - Display name of the parent layer
 */
export function showFeatureDetails(properties, layerName) {
  const detailsPanel = document.getElementById("details-panel");
  const detailsTitle = document.getElementById("details-title");
  const detailsLayerType = document.getElementById("details-layer-type");
  const detailsContent = document.getElementById("details-content");

  detailsLayerType.textContent = layerName;

  const title = getFeatureName(properties, "") || "Feature Details";
  detailsTitle.textContent = title;

  const filteredEntries = Object.entries(properties).filter(([key, val]) => {
    if (isEmptyValue(val)) return false;
    if (shouldHideAttribute(key, layerName)) return false;
    return true;
  });

  let visibleEntries = dedupeByBaseKey(filteredEntries);

  // Always surface Region first, regardless of its position in the source data.
  const regionIndex = visibleEntries.findIndex(
    ([key]) => normalizeAttributeKey(key) === "REGION",
  );
  if (regionIndex > 0) {
    const [regionEntry] = visibleEntries.splice(regionIndex, 1);
    visibleEntries = [regionEntry, ...visibleEntries];
  }

  if (visibleEntries.length === 0) {
    detailsContent.innerHTML =
      '<div class="empty-state">No metadata attributes found.</div>';
    detailsPanel.classList.remove("hidden");
    return;
  }

  let tableHtml = '<table class="details-table">';

  for (const [key, val] of visibleEntries) {
    const label = formatKeyLabel(key);
    const displayVal = formatAttributeValue(key, val);

    if (isEmptyValue(displayVal)) continue; // skip rows that became empty after formatting

    tableHtml += `<tr><th>${label}</th><td>${displayVal}</td></tr>`;
  }

  tableHtml += "</table>";

  // Check if the selected feature is a Polygon/MultiPolygon
  const selectedBoundary = AppState.selectedBoundary;
  const geomType = selectedBoundary?.feature?.geometry?.type;
  const isPolygon = geomType === "Polygon" || geomType === "MultiPolygon";

  if (isPolygon) {
    tableHtml += `<div id="overlapping-analysis-container"></div>`;
  }

  detailsContent.innerHTML = tableHtml;
  detailsPanel.classList.remove("hidden");

  if (isPolygon) {
    updateBoundaryAnalysis();
  }
}
