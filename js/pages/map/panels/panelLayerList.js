import { AppState } from "../../../base/config.js";

// ─── Layer panel structure definition ───────────────────────────────────────
// Defines the UI groupings and display labels independently from the data config.
// 'suffix' matches the part after the prefix (e.g. 'annual_crop' for 'cad_annual_crop').

const BOUNDARY_LAYERS = [
  { suffix: "boundary", label: null, colorClass: "boundary-color" },
  { suffix: "province", label: null, colorClass: "province-color" },
  { suffix: "municipality", label: null, colorClass: "municipality-color" },
];

const LAYER_SECTIONS = [
  {
    title: "Land Cover",
    layers: [
      { suffix: "annual_crop", label: "Annual Crop" },
      { suffix: "brush_shrubs", label: "Brush / Shrubs" },
      { suffix: "built_up", label: "Built Up" },
      { suffix: "closed_forest", label: "Closed Forest" },
      { suffix: "open_forest", label: "Open Forest" },
      { suffix: "open_barren", label: "Open Barren" },
      { suffix: "grassland", label: "Grassland" },
      { suffix: "perennial_crop_2025", label: "Perennial Crop" },
      { suffix: "fishpond", label: "Fishpond" },
      { suffix: "inland_water", label: "Inland Water" },
    ],
  },
  {
    title: "Land Classification",
    layers: [
      { suffix: "a_and_d", label: "A and D" },
      { suffix: "forestland", label: "Forestland" },
      { suffix: "pa", label: "Protected Areas" },
    ],
  },
  {
    title: "Biophysical",
    layers: [
      { suffix: "climate", label: "Climate" },
      { suffix: "slope", label: "Slope" },
      { suffix: "erosion", label: "Erosion" },
    ],
  },
  {
    title: "Hazards",
    layers: [
      { suffix: "flood_susceptibility", label: "Flood Susceptibility" },
      { suffix: "fire_susceptibility", label: "Fire Susceptibility" },
      { suffix: "landslide_susceptibility", label: "Landslide Susceptibility" },
    ],
  },
  {
    title: "Land Tenure / Development",
    layers: [
      { suffix: "ngp", label: "National Greening Program" },
      { suffix: "tenurial_instrument", label: "Tenurial Instrument" },
    ],
  },
];

// ─── HTML builders ──────────────────────────────────────────────────────────

/**
 * Builds the style controls (opacity + weight) for a layer row.
 * @param {string} layerKey - Full key like 'cad_annual_crop'
 */
function buildStyleControls(layerKey) {
  return `
    <div class="layer-style-controls">
      <div class="style-input" data-layer="${layerKey}" data-control="opacity">
        <span class="style-input-icon opacity-grip icon-flex">
          <i data-lucide="blend" width="12" height="12"></i>
        </span>
        <input
          type="number"
          class="style-input-value opacity-number-input"
          min="0"
          max="100"
          step="5"
        />
        <span class="style-input-unit">%</span>
      </div>
      <div class="style-input" data-layer="${layerKey}" data-control="weight">
        <span class="style-input-icon weight-grip icon-flex">
          <i data-lucide="minus" width="12" height="12"></i>
        </span>
        <input
          type="number"
          class="style-input-value weight-number-input"
          min="0"
          max="5"
          step="0.5"
        />
        <span class="style-input-unit">px</span>
      </div>
    </div>`;
}

/**
 * Builds a boundary-row layer item (no style controls).
 * @param {string} prefix - 'cad' or 'namria'
 * @param {{ suffix: string, label: string|null, colorClass: string }} layerDef
 */
function buildBoundaryRow(prefix, layerDef) {
  const key = `${prefix}_${layerDef.suffix}`;
  const layerCfg = AppState.layers[key];
  if (!layerCfg) return "";

  const checked = layerCfg.checked ? " checked" : "";
  const label = layerDef.label ?? layerCfg.name;
  const wrapId = `wrap-${prefix}-${layerDef.suffix}`;

  return `
    <div class="control-checkbox" id="${wrapId}">
      <input type="checkbox" id="${layerCfg.id}"${checked} />
      <span class="checkbox-custom ${layerDef.colorClass}"></span>
      <span class="layer-label">${label}</span>
    </div>`;
}

/**
 * Builds a regular layer row with opacity + weight style controls.
 * @param {string} prefix - 'cad' or 'namria'
 * @param {{ suffix: string, label: string }} layerDef
 */
function buildLayerRow(prefix, layerDef) {
  const key = `${prefix}_${layerDef.suffix}`;
  const layerCfg = AppState.layers[key];
  if (!layerCfg) return "";

  const checked = layerCfg.checked ? " checked" : "";

  return `
    <div class="control-checkbox">
      <input type="checkbox" id="${layerCfg.id}"${checked} />
      <span class="checkbox-custom layer-color"></span>
      <span class="layer-label">${layerDef.label}</span>
      ${buildStyleControls(key)}
    </div>`;
}

/**
 * Builds and injects the full layer list HTML for a given panel.
 * @param {string} prefix - 'cad' or 'namria'
 * @param {string} containerId - ID of the target container div in the DOM
 */
export function buildLayerPanelHTML(prefix, containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn(`[panelLayerList] Container #${containerId} not found.`);
    return;
  }

  // ── Boundary rows (no style controls) ──
  const boundaryRows = BOUNDARY_LAYERS.map((def) =>
    buildBoundaryRow(prefix, def),
  ).join("");

  // ── Sectioned layer rows ──
  const sections = LAYER_SECTIONS.map(({ title, layers }) => {
    const rows = layers.map((def) => buildLayerRow(prefix, def)).join("");
    if (!rows.trim()) return "";
    return `
      <div>
        <div class="section-title">${title}</div>
        <div class="sublayer-list">${rows}
        </div>
      </div>`;
  }).join("");

  container.innerHTML = `
    <div class="layer-list">${boundaryRows}
    </div>
    <div class="layer-list">
      <div>
        <div class="title">Layers</div>
        ${sections}
      </div>
    </div>`;

  // Re-run Lucide icon rendering for the newly injected icons
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}
