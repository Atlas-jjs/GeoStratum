import { AppState } from "../../../config.js";
import { listCustomLayers } from "../../../api/customLayersApi.js";
import { buildListItem } from "./importLayerItem.js";
import { showDuplicateNameNotice } from "./importDialogs.js";

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
const randomAccentColor = () =>
  ACCENT_PALETTE[Math.floor(Math.random() * ACCENT_PALETTE.length)];

let _map = null;
let _localIdCounter = 0;

export async function initImportControls(map, panel) {
  _map = map;

  const fileInput = document.getElementById(`${panel}-import-file`);
  const listEl = document.getElementById(`${panel}-imported-layer-list`);
  if (!fileInput || !listEl) return;

  fileInput.addEventListener("change", (e) =>
    handleFileSelected(e, panel, listEl),
  );

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

async function handleFileSelected(e, panel, listEl) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;

  try {
    const geojson = await parseImportedFile(file);
    const defaultName =
      file.name.replace(/\.(geojson|json|zip)$/i, "") || "Imported Layer";

    const name = uniqueLayerName(panel, defaultName);
    if (name !== defaultName) showDuplicateNameNotice(defaultName, name);

    addImportedLayer(panel, listEl, {
      name,
      color: randomAccentColor(),
      fillOpacity: 0.5,
      weight: 1,
      geojson,
    });
  } catch (err) {
    console.error("Failed to import file", err);
    alert(`Could not read "${file.name}" as GeoJSON or a zipped Shapefile.`);
  }
}

// * Parsing

async function parseImportedFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext !== "zip") return JSON.parse(await file.text());

  const buffer = await file.arrayBuffer();
  // shp.js (loaded globally in index.html): zip -> one FeatureCollection
  // or an array of them.
  const result = await window.shp(buffer);
  return Array.isArray(result) ? mergeFeatureCollections(result) : result;
}

const mergeFeatureCollections = (collections) => ({
  type: "FeatureCollection",
  features: collections.flatMap((fc) => fc.features || []),
});

// * Layer bookkeeping

const snapshotOf = (entry) => ({
  name: entry.name,
  color: entry.style.color,
  fillOpacity: entry.style.fillOpacity,
  weight: entry.style.weight,
});

// True if the entry has never been saved, or differs from its DB record.
const isDirty = (entry) => {
  const snap = entry.savedSnapshot;
  if (!snap) return true;
  const current = snapshotOf(entry);
  return Object.keys(snap).some((k) => snap[k] !== current[k]);
};

function uniqueLayerName(panel, baseName) {
  const normalize = (s) => s.trim().toLowerCase();
  const taken = new Set(
    AppState.importedLayers
      .filter((l) => l.panel === panel)
      .map((l) => normalize(l.name)),
  );
  if (!taken.has(normalize(baseName))) return baseName;

  let n = 2;
  let candidate = `${baseName} (${n})`;
  while (taken.has(normalize(candidate))) candidate = `${baseName} (${++n})`;
  return candidate;
}

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
    visible: true,
    leafletLayer: null,
    savedSnapshot: null,
  };
  entry.savedSnapshot = config.dbId ? snapshotOf(entry) : null;

  AppState.importedLayers.push(entry);

  const item = buildListItem(entry, {
    snapshotOf,
    isDirty,
    removeImportedLayer,
    setLayerVisibility,
  });
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

function renderImportedLayer(entry) {
  if (!_map || !entry.geojson) return;

  entry.leafletLayer = L.geoJSON(entry.geojson, {
    style: () => ({ ...entry.style }),
    onEachFeature: (feature, layer) => {
      const pane = PANE_BY_GEOMETRY[feature.geometry?.type];
      if (pane && _map.getPane(pane)) layer.options.pane = pane;
    },
  });
  _map.addLayer(entry.leafletLayer);
}

function setLayerVisibility(entry, visible) {
  entry.visible = visible;
  if (!entry.leafletLayer) return;
  const onMap = _map.hasLayer(entry.leafletLayer);
  if (visible && !onMap) _map.addLayer(entry.leafletLayer);
  else if (!visible && onMap) _map.removeLayer(entry.leafletLayer);
}
