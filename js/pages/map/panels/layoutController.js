import { initLayerContainer } from "../layers/layerSwitcher.js";

export function initLayoutController() {
  const cadPanel = document.getElementById("cad-controls-panel");
  const namriaPanel = document.getElementById("namria-controls-panel");
  const cadContainer = document.getElementById("cad-controls-container");
  const namriaContainer = document.getElementById("namria-controls-container");
  const switcher = document.getElementById("panel-switcher");
  const stackedTabs = switcher.querySelectorAll(".container-tab-btn");

  const { activateCad, activateNamria } = initLayerContainer();

  let activePanel = "cad";

  function applyLayout() {
    switcher.classList.remove("hidden");
    showPanels(activePanel);
  }

  function showPanels(panel) {
    activePanel = panel;
    if (panel === "cad") {
      cadContainer.classList.remove("hidden");
      namriaContainer.classList.add("hidden");
      cadPanel.classList.remove("hidden");
      namriaPanel.classList.add("hidden");
      activateCad();
    } else {
      namriaContainer.classList.remove("hidden");
      cadContainer.classList.add("hidden");
      namriaPanel.classList.remove("hidden");
      cadPanel.classList.add("hidden");
      activateNamria();
    }
    stackedTabs.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.panel === panel);
    });
  }

  stackedTabs.forEach((btn) => {
    btn.addEventListener("click", () => showPanels(btn.dataset.panel));
  });

  applyLayout();
}
