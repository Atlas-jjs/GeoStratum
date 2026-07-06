import { AppState } from "../../config.js";
import { loadLayer, deselectCurrentBoundary } from "../../map/layerRenderer.js";
import { updateBoundaryAnalysis } from "../ui/details/boundaryAnalysis.js";

/*
 * Attaches change event listeners to individual layer checkboxes dynamically based on AppState,
 * enabling users to explicitly add or remove specific data layers from the Leaflet map instance.
 */
export function setupLayerCheckboxes(map) {
  Object.keys(AppState.layers).forEach((key) => {
    const layerInfo = AppState.layers[key];
    const checkbox = document.getElementById(layerInfo.id);
    if (!checkbox) return;

    const checkboxCustom =
      checkbox.parentElement.querySelector(".checkbox-custom");

    if (checkboxCustom) {
      checkboxCustom.addEventListener("click", () => {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event("change"));
      });
    }

    checkbox.addEventListener("change", (e) => {
      layerInfo.checked = e.target.checked;
      if (layerInfo.checked) {
        loadLayer(key);
      } else {
        if (layerInfo.leafletLayer && map.hasLayer(layerInfo.leafletLayer)) {
          map.removeLayer(layerInfo.leafletLayer);
        }
        // If the unchecked layer contained the selected boundary, clear highlight and panel
        if (
          AppState.selectedBoundary &&
          AppState.selectedBoundary.layerKey === key
        ) {
          deselectCurrentBoundary();
        }
      }

      // Trigger recalculation of overlaps
      updateBoundaryAnalysis();
    });
  });
}
