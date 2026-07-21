import { initPanelController } from "../pages/map/panels/panelController.js";
import { initLayoutController } from "../pages/map/panels/layoutController.js";
import { initScreenshot } from "../pages/map/panels/details/screenshot.js";
import { buildLayerPanelHTML } from "../pages/map/panels/panelLayerList.js";

/*
 * Main UI entry point. Wires up all panel, control, and layout
 * behaviors once the Leaflet map instance is ready.
 * @param {L.Map} map
 */
export function initializeUI(map) {
  // Build layer lists dynamically from AppState.layers config
  buildLayerPanelHTML("cad", "cad-layer-list-container");
  buildLayerPanelHTML("namria", "namria-layer-list-container");

  initPanelController(map);
  initLayoutController();
  initScreenshot(map);
}
