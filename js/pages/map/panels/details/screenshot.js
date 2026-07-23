// * === Screenshot Component ===

let _capturedCanvas = null;

export function initScreenshot(map) {
  const screenshotBtn = document.getElementById("btn-screenshot");
  const closePreviewBtn = document.getElementById("btn-close-preview");
  const downloadBtn = document.getElementById("btn-download-screenshot");
  const formatSelect = document.getElementById("screenshot-format");
  const previewModal = document.getElementById("screenshot-preview-modal");

  screenshotBtn?.addEventListener("click", () => captureWithMap(map));

  closePreviewBtn?.addEventListener("click", () => {
    previewModal.classList.add("hidden");
    _capturedCanvas = null;
  });

  downloadBtn?.addEventListener("click", async () => {
    if (!_capturedCanvas) return;
    const format = formatSelect?.value || "png";
    const blob = await canvasToBlob(_capturedCanvas, format);
    if (!blob) return;

    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:.]/g, "-");
    const ext = format === "jpeg" ? "jpg" : format;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `DENR-CAR_Layers_-${timestamp}.${ext}`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  });

  previewModal?.addEventListener("click", (e) => {
    if (e.target === previewModal) {
      previewModal.classList.add("hidden");
      _capturedCanvas = null;
    }
  });
}

// Encodes PNG/JPEG/WEBP natively; TIFF has no canvas-native encoder, so it's built via UTIF.js from raw pixel data.
function canvasToBlob(canvas, format) {
  if (format === "tiff") {
    if (typeof UTIF === "undefined") {
      console.error("[Screenshot] UTIF.js not loaded, falling back to PNG");
      return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    }
    const { width, height } = canvas;
    const { data } = canvas.getContext("2d").getImageData(0, 0, width, height);
    const buffer = UTIF.encodeImage(data, width, height);
    return Promise.resolve(new Blob([buffer], { type: "image/tiff" }));
  }
  const mime =
    { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }[format] ||
    "image/png";
  const quality = format === "jpeg" || format === "webp" ? 0.92 : undefined;
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

// * ─── Transform Neutralization ────────────────────────────────────────────

/**
 * Reads a Leaflet internal position from either _leaflet_pos or the element's
 * CSS transform. Always returns pixel {x, y} regardless of the source.
 */
function getLeafletPos(el) {
  if (el?._leaflet_pos) return { x: el._leaflet_pos.x, y: el._leaflet_pos.y };
  const m = (el?.style?.transform ?? "").match(
    /translate(?:3d)?\(\s*([-\d.]+)px[,\s]+([-\d.]+)px/,
  );
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
}

/**
 * Freezes every animated Leaflet pane into a plain pixel position so that
 * html2canvas (which does NOT parse translate3d) sees the correct layout.
 *
 * Returns a restore() callback that puts everything back.
 */
function neutralizeLeafletTransforms(map) {
  const panes = map.getPanes();
  const mapPane = panes.mapPane;

  // Collect ALL panes that carry a transform
  const savedPanes = [];
  Object.values(panes).forEach((pane) => {
    if (!pane || !pane.style) return;
    const transform = pane.style.transform;
    if (!transform && !pane._leaflet_pos) return;
    const { x, y } = getLeafletPos(pane);
    savedPanes.push({ el: pane, transform, left: pane.style.left, top: pane.style.top });
    pane.style.transform = "none";
    pane.style.left = `${x}px`;
    pane.style.top = `${y}px`;
  });

  // Collect tiles (they also carry transforms in newer Leaflet builds)
  const tilePane = panes.tilePane;
  const tiles = Array.from(tilePane?.querySelectorAll(".leaflet-tile") ?? []);
  const savedTiles = tiles.map((t) => ({
    el: t,
    transform: t.style.transform,
    left: t.style.left,
    top: t.style.top,
  }));
  tiles.forEach((t) => {
    const pos = getLeafletPos(t);
    t.style.transform = "none";
    // If a tile had no explicit left/top but was positioned via transform, bake that in
    t.style.left = pos.x !== 0 ? `${pos.x}px` : t.style.left;
    t.style.top = pos.y !== 0 ? `${pos.y}px` : t.style.top;
  });

  return () => {
    savedPanes.forEach(({ el, transform, left, top }) => {
      el.style.transform = transform;
      el.style.left = left;
      el.style.top = top;
    });
    savedTiles.forEach(({ el, transform, left, top }) => {
      el.style.transform = transform;
      el.style.left = left;
      el.style.top = top;
    });
  };
}

// * ─── SVG Vector Overlay Compositing ─────────────────────────────────────

/**
 * Gathers all active Leaflet SVG renderers (one per custom pane) sorted by
 * z-index so they are composited in the correct draw order.
 */
function getActiveSvgRenderers(map) {
  const renderers = new Set();
  if (map._renderer) renderers.add(map._renderer);
  if (map._paneRenderers) {
    Object.values(map._paneRenderers).forEach((r) => r && renderers.add(r));
  }
  return Array.from(renderers)
    .filter((r) => r?._container?.tagName?.toLowerCase() === "svg")
    .sort((a, b) => {
      const zA = parseInt(a._container.parentNode?.style?.zIndex, 10) || 0;
      const zB = parseInt(b._container.parentNode?.style?.zIndex, 10) || 0;
      return zA - zB;
    });
}

/**
 * Renders one SVG renderer's shapes onto destCanvas at the correct pixel
 * position.  The SVG's own coordinate system already accounts for the
 * renderer _bounds origin, so we just need to know where the mapPane sat
 * when the capture was taken (panOffset) and where the map container is
 * on screen (mapRect).
 */
async function drawSvgOverlayOntoCanvas(map, renderer, destCanvas, DPR, mapRect, mapPanOffset) {
  if (!renderer?._container || !renderer._bounds || !renderer._svgSize) return;

  const { min: { x: minX, y: minY } } = renderer._bounds;
  const { x: w, y: h } = renderer._svgSize;

  // mapPanOffset is the pre-neutralization mapPane translation captured before
  // transforms were zeroed out. We use it (plus the renderer pane's own offset
  // relative to mapPane) to position the SVG correctly in the output canvas.
  const panePosBeforeNeutralize = mapPanOffset;

  const clone = renderer._container.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);
  clone.style.transform = "";
  clone.style.left = "";
  clone.style.top = "";

  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);

  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ctx = destCanvas.getContext("2d");
      const dx = (mapRect.left + panePosBeforeNeutralize.x + minX) * DPR;
      const dy = (mapRect.top + panePosBeforeNeutralize.y + minY) * DPR;
      ctx.drawImage(img, dx, dy, w * DPR, h * DPR);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
    img.src = url;
  });
}

// * ─── Details Panel ───────────────────────────────────────────────────────

async function drawDetailsPanelOntoCanvas(destCanvas, DPR) {
  const panel = document.getElementById("details-panel");
  if (!panel || panel.classList.contains("hidden")) return;

  // Capture the bounding rect BEFORE showing (it was hidden during Step 1)
  // We restore it before calling this function, so getBoundingClientRect is valid.
  const panelRect = panel.getBoundingClientRect();

  const panelCanvas = await html2canvas(panel, {
    useCORS: true,
    allowTaint: true,
    scale: DPR,
    logging: false,
    backgroundColor: null,
    // Capture only the panel element itself — no scroll offset needed
    x: 0,
    y: 0,
    width: panelRect.width,
    height: panelRect.height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
  });

  destCanvas.getContext("2d").drawImage(
    panelCanvas,
    panelRect.left * DPR,
    panelRect.top * DPR,
    panelRect.width * DPR,
    panelRect.height * DPR,
  );
}

// * ─── Stamp Helpers ───────────────────────────────────────────────────────

function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function stampBadge(ctx, canvas, DPR, text, alignRight = false) {
  const fontPx = Math.round(12 * DPR);
  const padX = Math.round(14 * DPR);
  const padY = Math.round(10 * DPR);
  const barHeight = Math.round(36 * DPR);
  const rad = Math.round(6 * DPR);

  ctx.font = `italic ${fontPx}px Inter, sans-serif`;
  const barW = ctx.measureText(text).width + padX * 2;
  const barX = alignRight
    ? canvas.width - barW - Math.round(padX / 2)
    : Math.round(padX / 2);
  const barY = canvas.height - barHeight;

  ctx.fillStyle = "rgba(9, 13, 22, 0.82)";
  roundedRectPath(ctx, barX, barY, barW, barHeight, rad);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.fillText(text, barX + padX, barY + padY + fontPx);
}

function stampDisclaimer(ctx, canvas, DPR) {
  stampBadge(
    ctx, canvas, DPR,
    "Disclaimer: This map is not intended to replace any official data but is for planning purposes only. Not for legal or navigational use.",
  );
}

function stampDateTime(ctx, canvas, DPR) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true });
  stampBadge(ctx, canvas, DPR, `Captured: ${dateStr} · ${timeStr}`, true);
}

let _logoImg;
function loadLogo() {
  if (_logoImg !== undefined) return Promise.resolve(_logoImg);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve((_logoImg = img));
    img.onerror = () => resolve((_logoImg = null));
    img.src = "./assets/denr_logo.png";
  });
}

async function stampLogo(ctx, canvas, DPR) {
  const logo = await loadLogo();
  const title = "DEPARTMENT OF ENVIRONMENT AND NATURAL RESOURCES";
  const subtitle = "Cordillera Administrative Region (CAR)";

  const titleFontPx = Math.round(14 * DPR);
  const subFontPx = Math.round(12 * DPR);
  const lineGap = Math.round(4 * DPR);
  const padX = Math.round(16 * DPR);
  const padY = Math.round(12 * DPR);
  const gap = Math.round(12 * DPR);
  const rad = Math.round(8 * DPR);
  const logoSize = Math.round(40 * DPR);

  ctx.font = `700 ${titleFontPx}px Inter, sans-serif`;
  const titleW = ctx.measureText(title).width;
  ctx.font = `500 ${subFontPx}px Inter, sans-serif`;
  const subW = ctx.measureText(subtitle).width;

  const textW = Math.max(titleW, subW);
  const textBlockH = titleFontPx + lineGap + subFontPx;
  const contentH = Math.max(logoSize, textBlockH);
  const barH = contentH + padY * 2;
  const barW = padX + (logo ? logoSize + gap : 0) + textW + padX;
  const barX = canvas.width - barW - Math.round(padX / 2);
  const barY = Math.round(padX / 2);

  ctx.fillStyle = "rgba(9, 13, 22, 0.94)";
  roundedRectPath(ctx, barX, barY, barW, barH, rad);
  ctx.fill();

  let cursorX = barX + padX;
  if (logo) {
    ctx.drawImage(logo, cursorX, barY + (barH - logoSize) / 2, logoSize, logoSize);
    cursorX += logoSize + gap;
  }

  const textY = barY + (barH - textBlockH) / 2;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.font = `700 ${titleFontPx}px Inter, sans-serif`;
  ctx.fillText(title, cursorX, textY);

  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.font = `500 ${subFontPx}px Inter, sans-serif`;
  ctx.fillText(subtitle, cursorX, textY + titleFontPx + lineGap);
  ctx.textBaseline = "alphabetic";
}

// * ─── Main Capture ────────────────────────────────────────────────────────

async function captureWithMap(map) {
  const screenshotBtn = document.getElementById("btn-screenshot");
  const detailsPanel = document.getElementById("details-panel");

  // UI elements to hide during map-body capture (they'll be redrawn separately or excluded)
  const toHide = [
    document.getElementById("panel-dock"),
    document.querySelector(".basemap-switcher"),
    document.querySelector(".controls-trigger-container"),
    detailsPanel,
  ].filter(Boolean);

  // ── Loading state ──
  if (screenshotBtn) {
    screenshotBtn.style.display = "none";
    screenshotBtn.classList.add("screenshot-btn--loading");
    screenshotBtn.disabled = true;
  }
  if (window.lucide) lucide.createIcons();

  // ── Snapshot geometry BEFORE any DOM mutation ──────────────────────────
  // getBoundingClientRect() must be read before we hide/transform anything
  // or it returns a stale/wrong value.
  const mapContainer = map.getContainer();
  const mapRect = mapContainer.getBoundingClientRect();
  const mapPanOffset = getLeafletPos(map.getPanes().mapPane);

  // Hide UI chrome
  toHide.forEach((el) => (el.style.visibility = "hidden"));

  // Hide SVG renderers — they'll be composited manually in Step 2
  const renderers = getActiveSvgRenderers(map);
  renderers.forEach((r) => (r._container.style.visibility = "hidden"));

  // ── Neutralize ALL Leaflet transforms so html2canvas sees pixel layout ──
  const restoreTransforms = neutralizeLeafletTransforms(map);

  // Double rAF: first frame applies style mutations, second allows paint.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const restore = () => {
    restoreTransforms();
    renderers.forEach((r) => (r._container.style.visibility = ""));
    toHide.forEach((el) => (el.style.visibility = ""));
  };

  try {
    const DPR = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;

    // ── Step 1: Capture the full viewport (map tiles + static UI) ──────────
    // All Leaflet elements now have plain pixel left/top — no transforms —
    // so they land exactly where the browser drew them on screen.
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      scale: DPR,
      logging: false,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      width: W,
      height: H,
      windowWidth: W,
      windowHeight: H,
    });

    // Restore transforms before compositing SVG / panel
    restore();

    // ── Step 2: Composite SVG vector overlays ──────────────────────────────
    // Pass the pre-neutralization geometry so overlays land in the right place.
    for (const renderer of renderers) {
      await drawSvgOverlayOntoCanvas(map, renderer, canvas, DPR, mapRect, mapPanOffset);
    }

    // ── Step 2b: Composite details panel on top ────────────────────────────
    await drawDetailsPanelOntoCanvas(canvas, DPR);

    // ── Step 3: Stamps ─────────────────────────────────────────────────────
    const ctx = canvas.getContext("2d");
    await stampLogo(ctx, canvas, DPR);
    stampDisclaimer(ctx, canvas, DPR);
    stampDateTime(ctx, canvas, DPR);

    _capturedCanvas = canvas;
    document.getElementById("screenshot-preview-img").src = canvas.toDataURL("image/png");
    document.getElementById("screenshot-preview-modal").classList.remove("hidden");
  } catch (err) {
    console.error("[Screenshot] Capture failed:", err);
    restore();
  } finally {
    if (screenshotBtn) {
      screenshotBtn.style.display = "";
      screenshotBtn.innerHTML = '<i data-lucide="camera"></i>';
      screenshotBtn.classList.remove("screenshot-btn--loading");
      screenshotBtn.disabled = false;
    }
    if (window.lucide) lucide.createIcons();
  }
}
