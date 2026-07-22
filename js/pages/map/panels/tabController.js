/*
 * Generic tab switcher for any panel that has a `.panel-tabs` header of
 * `.tab-btn` elements and a `.panel-content` body of `.tab-pane` elements.
 * Buttons are matched to panes via `data-tab="x"` <-> `#tab-x`.
 *
 * Used for the CAD and NAMRIA control panels, which each now have a
 * "Layers" tab and an "Import" tab.
 */
export function initTabController(panelEl) {
  if (!panelEl) return;

  const tabButtons = panelEl.querySelectorAll(".panel-tabs > .tab-btn");
  const tabPanes = panelEl.querySelectorAll(".panel-content > .tab-pane");

  if (tabButtons.length === 0 || tabPanes.length === 0) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      if (!target) return;

      tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
      tabPanes.forEach((pane) =>
        pane.classList.toggle("active", pane.id === `tab-${target}`),
      );
    });
  });
}
