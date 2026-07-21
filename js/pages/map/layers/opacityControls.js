import { AppState } from "../../../base/config.js";
import { makeDragGrip } from "../../../shared/utils/dragGrip.js";

export function initOpacityControls() {
  document
    .querySelectorAll('.style-input[data-control="opacity"]')
    .forEach((control) => {
      const layerConfig = AppState.layers[control.dataset.layer];
      if (!layerConfig) return;

      const grip = control.querySelector(".opacity-grip");
      const input = control.querySelector(".opacity-number-input");

      input.value = Math.round(layerConfig.style.fillOpacity * 100);

      const applyOpacity = (pct) => {
        const clamped = Math.max(0, Math.min(100, Math.round(pct)));
        input.value = clamped;
        layerConfig.style.fillOpacity = clamped / 100;
        layerConfig.leafletLayer?.setStyle({ fillOpacity: clamped / 100 });
      };

      makeDragGrip(grip, () => parseInt(input.value), applyOpacity);

      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        applyOpacity(parseInt(e.target.value) || 0);
      });
    });
}
