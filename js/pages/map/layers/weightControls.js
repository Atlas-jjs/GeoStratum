import { AppState } from "../../../base/config.js";
import { makeDragGrip } from "../../../shared/utils/dragGrip.js";

export function initWeightControls() {
  document
    .querySelectorAll('.style-input[data-control="weight"]')
    .forEach((control) => {
      const layerConfig = AppState.layers[control.dataset.layer];
      if (!layerConfig) return;

      const grip = control.querySelector(".weight-grip");
      const input = control.querySelector(".weight-number-input");

      input.value = layerConfig.style.weight ?? 1;

      const applyWeight = (val) => {
        const clamped = Math.max(0, Math.min(5, Math.round(val * 10) / 10));
        input.value = clamped;
        layerConfig.style.weight = clamped;
        layerConfig.leafletLayer?.setStyle({ weight: clamped });
      };

      makeDragGrip(grip, () => parseFloat(input.value), applyWeight, 0.05);

      input.addEventListener("click", (e) => e.stopPropagation());
      input.addEventListener("change", (e) => {
        e.stopPropagation();
        applyWeight(parseFloat(e.target.value) || 0);
      });
    });
}
