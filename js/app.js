import { BASEMAPS, initBasemapSwitcher } from "./pages/map/basemap.js";
import { initializeUI } from "./base/initUI.js";
import {
  initLayerRenderer,
  loadDefaultLayers,
} from "./pages/map/layerRenderer.js";
import { initMapAuthUI } from "./shared/auth/authUi.js";

let map = null;

// * Initialize Map on Load
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();

  // Bounds configuration for CAR, Philippines to lock pan/zoom view
  const southWest = L.latLng(12.7, 114.0);
  const northEast = L.latLng(22.0, 128.0);
  const mapBounds = L.latLngBounds(southWest, northEast);

  map = L.map("map", {
    maxBounds: mapBounds,
    maxBoundsViscosity: 1.0,
    inertia: false,
    minZoom: 8,
    maxZoom: 18,
    zoomControl: true,
    tap: false,
  }).setView([17.25, 120.9], 8);

  // * Default basemap
  let currentBasemap = BASEMAPS.satellite;
  currentBasemap.addTo(map);

  initBasemapSwitcher(map, currentBasemap, (newBasemap) => {
    currentBasemap = newBasemap;
  });

  // Setup Event Listeners for UI
  initLayerRenderer(map);
  initializeUI(map);
  loadDefaultLayers();

  // Initialize Auth Controls
  initMapAuthUI();
});
