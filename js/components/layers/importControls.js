import { AppState } from "../../config.js";
import { makeDragGrip } from "../../utils/dragGrip.js";
import {
  listCustomLayers,
  createCustomLayer,
  updateCustomLayer,
  deleteCustomLayer,
} from "../../api/customLayersApi.js";

/*
 * Flow:
 *  1. User uploads a .geojson/.json file or a zipped Shapefile (.zip).
 *  2. It's parsed client-side (shp.js handles the .zip case) and rendered
 *     on the map right away as a local, unsaved layer.
 *  3. The list item that appears reuses the same opacity/weight slider
 *     markup + drag-grip behavior as the built-in layers, plus a color
 *     input and a rename field.
 *  4. "Save to Database" POSTs the layer (name, color, opacity, weight,
 *     geojson) to the MySQL-backed API in /server. Reloading the page
 *     re-fetches previously saved layers for that panel.
 *
 * This is intentionally minimal - no auth, no validation of huge files,
 * no undo. It's meant as a skeleton to build the full feature on top of.
 */

const PANE_BY_GEOMETRY = {
  Point: "pointsPane",
  MultiPoint: "pointsPane",
  LineString: "linesPane",
  MultiLineString: "linesPane",
  Polygon: "polygonsPane",
  MultiPolygon: "polygonsPane",
};

const ACCENT_PALETTE = [
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f97316",
  "#e11d48",
  "#a855f7",
];

let _map = null;
let _localIdCounter = 0;

/* *
 * Wires up the Import tab for a given panel ("cad" | "namria") and
 * re-hydrates any layers that were previously saved to MySQL for it.
 */
export async function initImportControls(map, panel) {
  _map = map;

  const fileInput = document.getElementById(`${panel}-import-file`);
  const listEl = document.getElementById(`${panel}-imported-layer-list`);
  if (!fileInput || !listEl) return;

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    fileInput.value = ""; // allow re-selecting the same file later
    if (!file) return;

    try {
      const geojson = await parseImportedFile(file);
      const defaultName = file.name.replace(/\.(geojson|json|zip)$/i, "");

      addImportedLayer(panel, listEl, {
        name: defaultName || "Imported Layer",
        color: randomAccentColor(),
        fillOpacity: 0.5,
        weight: 1,
        geojson,
      });
    } catch (err) {
      console.error("Failed to import file", err);
      alert(`Could not read "${file.name}" as GeoJSON or a zipped Shapefile.`);
    }
  });

  // Re-load anything already saved to MySQL for this panel.
  try {
    const saved = await listCustomLayers(panel);
    saved.forEach((row) =>
      addImportedLayer(panel, listEl, {
        dbId: row.id,
        name: row.name,
        color: row.color,
        fillOpacity: row.fillOpacity,
        weight: row.weight,
        geojson: row.geojson,
      }),
    );
  } catch (err) {
    // Non-fatal: the server may not be running yet during early development.
    console.warn("Could not load saved custom layers:", err.message);
  }
}

// * ============================= Parsing =============================

async function parseImportedFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "zip") {
    const buffer = await file.arrayBuffer();
    // shp.js (already loaded globally in index.html) turns a zipped
    // Shapefile into GeoJSON. It can resolve to either a single
    // FeatureCollection or an array of them (one per layer in the zip).
    const result = await window.shp(buffer);
    return Array.isArray(result) ? mergeFeatureCollections(result) : result;
  }

  const text = await file.text();
  return JSON.parse(text);
}

function mergeFeatureCollections(collections) {
  return {
    type: "FeatureCollection",
    features: collections.flatMap((fc) => fc.features || []),
  };
}

function randomAccentColor() {
  return ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)];
}

/* *
 * True if the entry has never been saved, or its current name/color/
 * opacity/weight differ from what's on record in the database.
 */
function isDirty(entry) {
  if (!entry.savedSnapshot) return true;
  const snap = entry.savedSnapshot;
  return (
    entry.name !== snap.name ||
    entry.style.color !== snap.color ||
    entry.style.fillOpacity !== snap.fillOpacity ||
    entry.style.weight !== snap.weight
  );
}

// * ========================= Layer bookkeeping =========================

function addImportedLayer(panel, listEl, config) {
  const importId = config.dbId
    ? `db-${config.dbId}`
    : `local-${panel}-${++_localIdCounter}`;

  const entry = {
    importId,
    dbId: config.dbId ?? null,
    panel,
    name: config.name,
    style: {
      color: config.color,
      fillColor: config.color,
      weight: config.weight,
      fillOpacity: config.fillOpacity,
    },
    geojson: config.geojson,
    // Whether the layer is currently shown on the map. Purely a client-side
    // view toggle (same idea as the checkboxes in the Layers tab) - it is
    // NOT persisted to the database, it just adds/removes the Leaflet layer.
    visible: true,
    leafletLayer: null,
    // Snapshot of the values as they exist in the database. `null` means
    // "never saved" (a fresh import), which always counts as dirty.
    savedSnapshot: config.dbId
      ? {
          name: config.name,
          color: config.color,
          fillOpacity: config.fillOpacity,
          weight: config.weight,
        }
      : null,
  };

  AppState.importedLayers.push(entry);

  const item = buildListItem(entry);
  listEl.appendChild(item);
  item._refreshSaveButton?.();
  window.lucide?.createIcons();

  renderImportedLayer(entry);
}

function removeImportedLayer(entry) {
  if (entry.leafletLayer && _map.hasLayer(entry.leafletLayer)) {
    _map.removeLayer(entry.leafletLayer);
  }
  const idx = AppState.importedLayers.findIndex(
    (l) => l.importId === entry.importId,
  );
  if (idx !== -1) AppState.importedLayers.splice(idx, 1);
}

// * ============================ Rendering =============================

function renderImportedLayer(entry) {
  if (!_map || !entry.geojson) return;

  entry.leafletLayer = L.geoJSON(entry.geojson, {
    style: () => ({ ...entry.style }),
    onEachFeature: (feature, layer) => {
      const paneName = PANE_BY_GEOMETRY[feature.geometry?.type];
      if (paneName && _map.getPane(paneName)) {
        layer.options.pane = paneName;
      }
    },
  });

  _map.addLayer(entry.leafletLayer);
}

// * ============================ UI / DOM ==============================

function buildListItem(entry) {
  const item = document.createElement("div");
  item.className = "imported-layer-item";
  item.dataset.importId = entry.importId;

  item.innerHTML = `
    <div class="imported-layer-row">
      <div class="control-checkbox imported-visibility-toggle">
        <input
          type="checkbox"
          class="imported-visibility-input"
          checked
        />
        <span class="checkbox-custom layer-color"></span>
      </div>
      <input
        type="color"
        class="imported-color-input"
        value="${entry.style.color}"
        title="Layer color"
      />
      <input
        type="text"
        class="imported-name-input"
        value="${escapeHtml(entry.name)}"
        title="Layer name"
      />
      <button class="icon-btn imported-delete-btn" title="Remove layer">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
    <div class="layer-style-controls">
      <div class="style-input" data-control="opacity">
        <span class="style-input-icon opacity-grip" style="display: flex; align-items: center; justify-content: center;"><i data-lucide="blend" width="12" height="12"></i></span>
        <input
          type="number"
          class="style-input-value opacity-number-input"
          min="0"
          max="100"
          step="5"
          value="${Math.round(entry.style.fillOpacity * 100)}"
        />
        <span class="style-input-unit">%</span>
      </div>
      <div class="style-input" data-control="weight">
        <span class="style-input-icon weight-grip" style="display: flex; align-items: center; justify-content: center;"><i data-lucide="minus" width="12" height="12"></i></span>
        <input
          type="number"
          class="style-input-value weight-number-input"
          min="0"
          max="5"
          step="0.5"
          value="${entry.style.weight}"
        />
        <span class="style-input-unit">px</span>
      </div>
    </div>
    <button class="btn-primary imported-save-btn">
      <i data-lucide="database"></i>
      <span class="imported-save-btn-label">Save to Database</span>
    </button>
  `;

  wireListItem(item, entry);
  return item;
}

function wireListItem(item, entry) {
  const visibilityCheckbox = item.querySelector(".imported-visibility-input");
  const visibilityCustom = item.querySelector(
    ".imported-visibility-toggle .checkbox-custom",
  );
  const colorInput = item.querySelector(".imported-color-input");
  const nameInput = item.querySelector(".imported-name-input");
  const deleteBtn = item.querySelector(".imported-delete-btn");
  const saveBtn = item.querySelector(".imported-save-btn");
  const saveBtnLabel = item.querySelector(".imported-save-btn-label");

  const opacityGrip = item.querySelector(".opacity-grip");
  const opacityInput = item.querySelector(".opacity-number-input");
  const weightGrip = item.querySelector(".weight-grip");
  const weightInput = item.querySelector(".weight-number-input");

  // * Save button only shows up while there's something new to persist.
  // Visibility is handled by CSS (`.is-visible`) so it fades/slides in and
  // out smoothly instead of snapping with display:none. We stash this on
  // the item instead of calling it immediately, because at this point the
  // item hasn't been inserted into the document yet (buildListItem() wires
  // it up before addImportedLayer() appends it) - toggling the class on a
  // detached node is what let the very first render "work" but left later
  // ones stuck. addImportedLayer() calls this once the item is actually
  // in the DOM.
  const refreshSaveButton = () => {
    const dirty = isDirty(entry);
    saveBtn.classList.toggle("is-visible", dirty);
    if (dirty && saveBtnLabel.textContent !== "Saving...") {
      saveBtnLabel.textContent = "Save to Database";
    }
  };
  item._refreshSaveButton = refreshSaveButton;

  // * Visibility - identical behavior to the checkboxes in the Layers tab:
  // the custom square is what's actually visible/clickable (the real
  // checkbox is invisible per checkbox.css), so a click on it just flips
  // the real checkbox and lets its "change" handler do the work.
  visibilityCustom.addEventListener("click", () => {
    visibilityCheckbox.checked = !visibilityCheckbox.checked;
    visibilityCheckbox.dispatchEvent(new Event("change"));
  });

  visibilityCheckbox.addEventListener("change", (e) => {
    entry.visible = e.target.checked;
    if (!entry.leafletLayer) return;

    if (entry.visible) {
      if (!_map.hasLayer(entry.leafletLayer)) {
        _map.addLayer(entry.leafletLayer);
      }
    } else if (_map.hasLayer(entry.leafletLayer)) {
      _map.removeLayer(entry.leafletLayer);
    }
  });

  // * Color - inherited behavior: same live setStyle() pattern as opacity/weight
  colorInput.addEventListener("input", (e) => {
    entry.style.color = e.target.value;
    entry.style.fillColor = e.target.value;
    entry.leafletLayer?.setStyle({
      color: entry.style.color,
      fillColor: entry.style.fillColor,
    });
    refreshSaveButton();
  });

  // * Rename
  nameInput.addEventListener("change", (e) => {
    entry.name = e.target.value.trim() || entry.name;
    e.target.value = entry.name;
    refreshSaveButton();
  });

  // * Opacity - identical logic/markup to opacityControls.js
  const applyOpacity = (pct) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    opacityInput.value = clamped;
    entry.style.fillOpacity = clamped / 100;
    entry.leafletLayer?.setStyle({ fillOpacity: clamped / 100 });
    refreshSaveButton();
  };
  makeDragGrip(opacityGrip, () => parseInt(opacityInput.value), applyOpacity);
  opacityInput.addEventListener("click", (e) => e.stopPropagation());
  opacityInput.addEventListener("change", (e) => {
    e.stopPropagation();
    applyOpacity(parseInt(e.target.value) || 0);
  });

  // * Weight - identical logic/markup to weightControls.js
  const applyWeight = (val) => {
    const clamped = Math.max(0, Math.min(5, Math.round(val * 10) / 10));
    weightInput.value = clamped;
    entry.style.weight = clamped;
    entry.leafletLayer?.setStyle({ weight: clamped });
    refreshSaveButton();
  };
  makeDragGrip(
    weightGrip,
    () => parseFloat(weightInput.value),
    applyWeight,
    0.05,
  );
  weightInput.addEventListener("click", (e) => e.stopPropagation());
  weightInput.addEventListener("change", (e) => {
    e.stopPropagation();
    applyWeight(parseFloat(e.target.value) || 0);
  });

  // * Delete - removes from map, list, AppState, and the database (if saved)
  deleteBtn.addEventListener("click", async () => {
    removeImportedLayer(entry);
    item.remove();

    if (entry.dbId) {
      try {
        await deleteCustomLayer(entry.dbId);
      } catch (err) {
        console.error("Failed to delete custom layer from database:", err);
      }
    }
  });

  // * Save - create or update the row in MySQL
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtnLabel.textContent = "Saving...";

    const payload = {
      panel: entry.panel,
      name: entry.name,
      color: entry.style.color,
      fillOpacity: entry.style.fillOpacity,
      weight: entry.style.weight,
      geojson: entry.geojson,
    };

    try {
      if (entry.dbId) {
        await updateCustomLayer(entry.dbId, payload);
      } else {
        const saved = await createCustomLayer(payload);
        entry.dbId = saved.id;
        item.dataset.importId = `db-${saved.id}`;
      }
      entry.savedSnapshot = {
        name: entry.name,
        color: entry.style.color,
        fillOpacity: entry.style.fillOpacity,
        weight: entry.style.weight,
      };
      saveBtnLabel.textContent = "Saved";
      refreshSaveButton();
    } catch (err) {
      console.error("Failed to save custom layer:", err);
      saveBtnLabel.textContent = "Save failed - retry";
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}