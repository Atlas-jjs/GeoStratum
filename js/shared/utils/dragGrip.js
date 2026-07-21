export function makeDragGrip(grip, getValue, applyFn, sensitivity = 1) {
  // Guard: if already initialized, skip — prevents stacked listeners on re-render
  if (grip.dataset.dragInit === "true") return;
  grip.dataset.dragInit = "true";

  grip.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();

    grip.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startVal = getValue();
    document.body.style.cursor = "ew-resize";

    const onMove = (e) =>
      applyFn(startVal + (e.clientX - startX) * sensitivity);

    const onUp = () => {
      document.body.style.cursor = "";
      grip.removeEventListener("pointermove", onMove);
      grip.removeEventListener("pointerup", onUp);
      grip.removeEventListener("pointercancel", onUp);
    };

    grip.addEventListener("pointermove", onMove);
    grip.addEventListener("pointerup", onUp);
    grip.addEventListener("pointercancel", onUp);
  });
}
