// * Add event listener to switch between CADASTRE and NAMRIA Containers
export function initLayerContainer() {
  const cadContainer = document.getElementById("cad-controls-container");
  const namriaContainer = document.getElementById("namria-controls-container");

  function setCheckboxState(container, disabled) {
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    checkboxes.forEach((checkbox) => {
      checkbox.disabled = disabled;

      if (disabled && checkbox.checked) {
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  function activateCad() {
    setCheckboxState(cadContainer, false);
    setCheckboxState(namriaContainer, true);
  }

  function activateNamria() {
    setCheckboxState(namriaContainer, false);
    setCheckboxState(cadContainer, true);
  }

  return { activateCad, activateNamria };
}
