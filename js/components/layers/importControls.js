import { AppState } from "../../config.js";
import { makeDragGrip } from "../../utils/dragGrip.js";
import {
  listCustomLayers,
  createCustomLayer,
  updateCustomLayer,
  deleteCustomLayer,
} from "../../api/customLayersApi.js";

/*
 * Flow: user uploads a .geojson/.json or zipped Shapefile (parsed via
 * shp.js), rendered immediately as a local, unsaved layer, styled/renamed
 * with the same controls as the built-in layers. "Save to Database" POSTs
 * it to the MySQL API in /server; reloading re-fetches saved layers per
 * panel. Intentionally minimal - no auth, no big-file validation, no undo.
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

const OPACITY_CONTROL = {
  key: "fillOpacity",
  control: "opacity",
  icon: "blend",
  unit: "%",
  min: 0,
  max: 100,
  step: 5,
  inputmode: "numeric",
  toInput: (v) => Math.round(v * 100),
  fromInput: (v) => Math.max(0, Math.min(100, Math.round(v))) / 100,
};
const WEIGHT_CONTROL = {
  key: "weight",
  control: "weight",
  icon: "minus",
  unit: "px",
  min: 0,
  max: 5,
  step: 0.5,
  inputmode: "decimal",
  dragStep: 0.05,
  toInput: (v) => v,
  fromInput: (v) => Math.max(0, Math.min(5, Math.round(v * 10) / 10)),
};
const STYLE_CONTROLS = [OPACITY_CONTROL, WEIGHT_CONTROL];

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
      const defaultName =
        file.name.replace(/\.(geojson|json|zip)$/i, "") || "Imported Layer";
      // Auto-dedupe against layers already in this panel. This is a rename,
      // not a destructive action, so it just happens - no confirmation
      // modal, just a brief heads-up toast (see rule 3 in the PR notes).
      const finalName = uniqueLayerName(panel, defaultName);
      if (finalName !== defaultName) {
        showDuplicateNameNotice(defaultName, finalName);
      }
      addImportedLayer(panel, listEl, {
        name: finalName,
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
    // shp.js (loaded globally in index.html): zip -> one FeatureCollection
    // or an array of them.
    const result = await window.shp(buffer);
    return Array.isArray(result) ? mergeFeatureCollections(result) : result;
  }
  return JSON.parse(await file.text());
}

const mergeFeatureCollections = (collections) => ({
  type: "FeatureCollection",
  features: collections.flatMap((fc) => fc.features || []),
});

const randomAccentColor = () =>
  ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)];

// If `baseName` collides with an existing layer's name in this panel,
// append " (2)", " (3)", etc. until it's unique. Comparison is
// case/whitespace-insensitive so "Flood Zones" and "flood zones " still
// count as the same name.
function uniqueLayerName(panel, baseName) {
  const normalize = (s) => s.trim().toLowerCase();
  const existingNames = new Set(
    AppState.importedLayers
      .filter((l) => l.panel === panel)
      .map((l) => normalize(l.name)),
  );

  if (!existingNames.has(normalize(baseName))) return baseName;

  let suffix = 2;
  let candidate = `${baseName} (${suffix})`;
  while (existingNames.has(normalize(candidate))) {
    suffix += 1;
    candidate = `${baseName} (${suffix})`;
  }
  return candidate;
}

// Brief, non-blocking heads-up that an import was auto-renamed to avoid a
// name collision. Deliberately not a modal: nothing destructive happened
// and nothing needs a decision, so it shouldn't interrupt the workflow.
let duplicateToastTimer = null;
function showDuplicateNameNotice(originalName, finalName) {
  const toast = document.getElementById("duplicate-name-toast");
  const message = document.getElementById("duplicate-name-toast-message");
  if (!toast || !message) return; // purely informational - fail silently

  message.textContent = `"${originalName}" already exists - imported as "${finalName}".`;
  toast.classList.remove("hidden");
  // Force reflow so the transition re-triggers on back-to-back imports.
  void toast.offsetWidth;
  toast.classList.add("is-visible");

  clearTimeout(duplicateToastTimer);
  duplicateToastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.classList.add("hidden"), 200);
  }, 4000);
}

// Swaps window.confirm() for the static modal in index.html. Resolves true
// on "Remove", false on cancel/backdrop/Escape. Falls back to
// window.confirm() if the modal markup is somehow missing, so a delete
// action never silently breaks.
function confirmDelete(name) {
  return new Promise((resolve) => {
    const modal = document.getElementById("delete-confirm-modal");
    const message = document.getElementById("delete-confirm-message");
    const btnCancel = document.getElementById("btn-cancel-delete");
    const btnConfirm = document.getElementById("btn-confirm-delete");
    if (!modal || !message || !btnCancel || !btnConfirm) {
      resolve(window.confirm(`Remove "${name}"? This cannot be undone.`));
      return;
    }

    message.textContent = `Remove "${name}"? This cannot be undone.`;
    modal.classList.remove("hidden");

    const cleanup = (result) => {
      modal.classList.add("hidden");
      btnCancel.removeEventListener("click", onCancel);
      btnConfirm.removeEventListener("click", onConfirm);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onConfirm = () => cleanup(true);
    const onBackdrop = (e) => {
      if (e.target === modal) cleanup(false);
    };
    const onKeydown = (e) => {
      if (e.key === "Escape") cleanup(false);
    };

    btnCancel.addEventListener("click", onCancel);
    btnConfirm.addEventListener("click", onConfirm);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

// Snapshot of the persisted fields, used both to detect drift from the DB
// and to record what was just saved.
const snapshotOf = (entry) => ({
  name: entry.name,
  color: entry.style.color,
  fillOpacity: entry.style.fillOpacity,
  weight: entry.style.weight,
});

// True if the entry has never been saved, or differs from its DB record.
function isDirty(entry) {
  const snap = entry.savedSnapshot;
  if (!snap) return true;
  const current = snapshotOf(entry);
  return Object.keys(snap).some((k) => snap[k] !== current[k]);
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
    visible: true, // client-side view toggle only, never persisted to the DB
    leafletLayer: null,
    savedSnapshot: null, // null = never saved => always dirty
  };
  entry.savedSnapshot = config.dbId ? snapshotOf(entry) : null;

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
      if (paneName && _map.getPane(paneName)) layer.options.pane = paneName;
    },
  });

  _map.addLayer(entry.leafletLayer);
}

// * ============================ UI / DOM ==============================

function styleInputHtml(def, value, label) {
  return `
    <div class="style-input" data-control="${def.control}">
      <span class="style-input-icon ${def.control}-grip" style="display: flex; align-items: center; justify-content: center;"><i data-lucide="${def.icon}" width="12" height="12"></i></span>
      <input type="number" class="style-input-value ${def.control}-number-input" min="${def.min}" max="${def.max}" step="${def.step}" inputmode="${def.inputmode}" value="${value}" aria-label="${label}" />
      <span class="style-input-unit">${def.unit}</span>
    </div>`;
}

function buildListItem(entry) {
  const item = document.createElement("div");
  item.className = "imported-layer-item";
  item.dataset.importId = entry.importId;

  const safeName = escapeHtml(entry.name);
  const styleInputsHtml = STYLE_CONTROLS.map((def) =>
    styleInputHtml(
      def,
      def.toInput(entry.style[def.key]),
      `${def.control === "opacity" ? "Opacity percent" : "Line weight"} for ${safeName}`,
    ),
  ).join("");

  item.innerHTML = `
    <div class="imported-layer-row">
      <div class="control-checkbox imported-visibility-toggle">
        <input type="checkbox" class="imported-visibility-input" checked aria-label="Toggle visibility for ${safeName}" />
        <span class="checkbox-custom layer-color"></span>
      </div>
      <input type="color" class="imported-color-input" value="${entry.style.color}" title="Layer color" aria-label="Layer color for ${safeName}" />
      <input type="text" class="imported-name-input" value="${safeName}" title="${safeName}" aria-label="Layer name" maxlength="80" enterkeyhint="done" />
      <button class="icon-btn imported-delete-btn" title="Remove layer" aria-label="Remove ${safeName}">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
    <div class="layer-style-controls">${styleInputsHtml}</div>
    <button class="btn-primary imported-save-btn">
      <i data-lucide="database"></i>
      <span class="imported-save-btn-label">Save to Database</span>
    </button>
  `;

  wireListItem(item, entry);
  return item;
}

// Wires a drag-grip + number input pair (opacity or weight) to
// `entry.style[def.key]`: live setStyle() on change, plus a wheel-blur guard
// so scrolling past a focused input never silently overwrites its value.
function wireStyleControl(item, entry, def, onChange) {
  const grip = item.querySelector(`.${def.control}-grip`);
  const input = item.querySelector(`.${def.control}-number-input`);
  const parse = def.inputmode === "decimal" ? parseFloat : parseInt;

  const apply = (raw) => {
    const value = def.fromInput(raw);
    input.value = def.toInput(value);
    entry.style[def.key] = value;
    entry.leafletLayer?.setStyle({ [def.key]: value });
    onChange();
  };

  makeDragGrip(grip, () => parse(input.value), apply, def.dragStep);
  input.addEventListener("click", (e) => e.stopPropagation());
  input.addEventListener("change", (e) => {
    e.stopPropagation();
    apply(parse(e.target.value) || 0);
  });
  input.addEventListener("wheel", () => input.blur(), { passive: true });
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

  // Save button only shows while there's something new to persist. Stashed
  // on the item rather than called immediately, because buildListItem()
  // wires the item up before addImportedLayer() has appended it - toggling
  // the class on a detached node doesn't stick for later re-renders.
  const refreshSaveButton = () => {
    const dirty = isDirty(entry);
    saveBtn.classList.toggle("is-visible", dirty);
    if (dirty && saveBtnLabel.textContent !== "Saving...") {
      saveBtnLabel.textContent = "Save to Database";
    }
  };
  item._refreshSaveButton = refreshSaveButton;

  // Visibility - the custom square is the visible/clickable control (the
  // real checkbox is invisible per checkbox.css); a click just flips it.
  visibilityCustom.addEventListener("click", () => {
    visibilityCheckbox.checked = !visibilityCheckbox.checked;
    visibilityCheckbox.dispatchEvent(new Event("change"));
  });
  visibilityCheckbox.addEventListener("change", (e) => {
    entry.visible = e.target.checked;
    if (!entry.leafletLayer) return;
    const onMap = _map.hasLayer(entry.leafletLayer);
    if (entry.visible && !onMap) _map.addLayer(entry.leafletLayer);
    else if (!entry.visible && onMap) _map.removeLayer(entry.leafletLayer);
  });

  colorInput.addEventListener("input", (e) => {
    entry.style.color = e.target.value;
    entry.style.fillColor = e.target.value;
    entry.leafletLayer?.setStyle({
      color: entry.style.color,
      fillColor: entry.style.fillColor,
    });
    refreshSaveButton();
  });

  nameInput.addEventListener("change", (e) => {
    entry.name = e.target.value.trim() || entry.name;
    e.target.value = entry.name;
    nameInput.title = entry.name;
    refreshSaveButton();
  });
  // Enter commits the rename via blur -> "change" (there's no <form> to submit).
  nameInput.addEventListener(
    "keydown",
    (e) => e.key === "Enter" && nameInput.blur(),
  );

  STYLE_CONTROLS.forEach((def) =>
    wireStyleControl(item, entry, def, refreshSaveButton),
  );

  // Delete - removes from map, list, AppState, and the database (if saved).
  deleteBtn.addEventListener("click", async () => {
    // Rule 1: an entry with no dbId only exists locally - there's nothing
    // in the database to lose, so don't interrupt with a warning at all.
    if (entry.dbId) {
      const confirmed = await confirmDelete(entry.name);
      if (!confirmed) return;
    }

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

  // Save - create or update the row in MySQL.
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    saveBtnLabel.textContent = "Saving...";

    const payload = {
      panel: entry.panel,
      geojson: entry.geojson,
      ...snapshotOf(entry),
    };

    try {
      if (entry.dbId) {
        await updateCustomLayer(entry.dbId, payload);
      } else {
        const saved = await createCustomLayer(payload);
        entry.dbId = saved.id;
        item.dataset.importId = `db-${saved.id}`;
      }
      entry.savedSnapshot = snapshotOf(entry);
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
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
