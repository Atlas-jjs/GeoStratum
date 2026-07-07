import { initPanelController } from "./ui/panelController.js";
import { initLayoutController } from "./ui/layoutController.js";
import { initScreenshot } from "./ui/details/screenshot.js";

/*
 * Main UI entry point. Wires up all panel, control, and layout
 * behaviors once the Leaflet map instance is ready.
 * @param {L.Map} map
 */
export function initializeUI(map) {
  initPanelController(map);
  initLayoutController();
  initScreenshot(map);
}
