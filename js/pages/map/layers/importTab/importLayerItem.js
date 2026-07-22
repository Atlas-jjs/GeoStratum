import { makeDragGrip } from "../../../../shared/utils/dragGrip.js";
import {
  createCustomLayer,
  updateCustomLayer,
  deleteCustomLayer,
} from "../../../../shared/api/customLayersApi.js";
import { confirmDelete } from "./importDialogs.js";

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

export function buildListItem(entry, store) {
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
    <button class="btn-primary btn imported-save-btn">
      <i data-lucide="database"></i>
      <span class="imported-save-btn-label">Save to Database</span>
    </button>
  `;

  wireListItem(item, entry, store);
  return item;
}

function styleInputHtml(def, value, label) {
  return `
    <div class="style-input" data-control="${def.control}">
      <span class="style-input-icon ${def.control}-grip" style="display: flex; align-items: center; justify-content: center;"><i data-lucide="${def.icon}" width="12" height="12"></i></span>
      <input type="number" class="style-input-value ${def.control}-number-input" min="${def.min}" max="${def.max}" step="${def.step}" inputmode="${def.inputmode}" value="${value}" aria-label="${label}" />
      <span class="style-input-unit">${def.unit}</span>
    </div>`;
}

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

function wireListItem(
  item,
  entry,
  { snapshotOf, isDirty, removeImportedLayer, setLayerVisibility },
) {
  const visibilityCheckbox = item.querySelector(".imported-visibility-input");
  const visibilityCustom = item.querySelector(
    ".imported-visibility-toggle .checkbox-custom",
  );
  const colorInput = item.querySelector(".imported-color-input");
  const nameInput = item.querySelector(".imported-name-input");
  const deleteBtn = item.querySelector(".imported-delete-btn");
  const saveBtn = item.querySelector(".imported-save-btn");
  const saveBtnLabel = item.querySelector(".imported-save-btn-label");

  const refreshSaveButton = () => {
    const dirty = isDirty(entry);
    saveBtn.classList.toggle("is-visible", dirty);
    if (dirty && saveBtnLabel.textContent !== "Saving...") {
      saveBtnLabel.textContent = "Save to Database";
    }
  };
  item._refreshSaveButton = refreshSaveButton;

  visibilityCustom.addEventListener("click", () => {
    visibilityCheckbox.checked = !visibilityCheckbox.checked;
    visibilityCheckbox.dispatchEvent(new Event("change"));
  });
  visibilityCheckbox.addEventListener("change", (e) =>
    setLayerVisibility(entry, e.target.checked),
  );

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
  nameInput.addEventListener(
    "keydown",
    (e) => e.key === "Enter" && nameInput.blur(),
  );

  STYLE_CONTROLS.forEach((def) =>
    wireStyleControl(item, entry, def, refreshSaveButton),
  );

  deleteBtn.addEventListener("click", async () => {
    if (entry.dbId && !(await confirmDelete(entry.name))) return;

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
    .replace(/&/g, "and")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
