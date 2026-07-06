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

// * Tile-pane fix  (Problem A)

function getLeafletPos(el) {
  if (el?._leaflet_pos) return { x: el._leaflet_pos.x, y: el._leaflet_pos.y };
  const m = (el?.style?.transform ?? "").match(
    /translate(?:3d)?\(\s*([-\d.]+)px[,\s]+([-\d.]+)px/,
  );
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
}

function fixTilesForCapture(map) {
  const { mapPane, tilePane } = map.getPanes();
  const { x: dx, y: dy } = getLeafletPos(mapPane);
  const savedTransform = mapPane.style.transform;
  const tiles = Array.from(tilePane?.querySelectorAll(".leaflet-tile") ?? []);
  const saved = tiles.map((t) => ({
    el: t,
    left: t.style.left,
    top: t.style.top,
  }));

  mapPane.style.transform = "translate3d(0px,0px,0px)";
  tiles.forEach((t) => {
    t.style.left = `${(parseFloat(t.style.left) || 0) + dx}px`;
    t.style.top = `${(parseFloat(t.style.top) || 0) + dy}px`;
  });

  return () => {
    mapPane.style.transform = savedTransform;
    saved.forEach(({ el, left, top }) => {
      el.style.left = left;
      el.style.top = top;
    });
  };
}

// * SVG overlay → canvas  (Problem B)

// Each custom pane (polygons/lines/points) gets its own SVG renderer in map._paneRenderers,
// separate from the legacy shared map._renderer, so all of them must be hidden/composited — not just one.
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

async function drawSvgOverlayOntoCanvas(map, renderer, destCanvas, DPR) {
  if (!renderer?._container || !renderer._bounds || !renderer._svgSize) return;

  const {
    min: { x: minX, y: minY },
  } = renderer._bounds;
  const { x: w, y: h } = renderer._svgSize;
  const panOffset = getLeafletPos(map.getPanes().mapPane);
  const { left, top } = map.getContainer().getBoundingClientRect();

  const clone = renderer._container.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);
  clone.style.transform = "";

  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    }),
  );

  await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      destCanvas
        .getContext("2d")
        .drawImage(
          img,
          (left + panOffset.x + minX) * DPR,
          (top + panOffset.y + minY) * DPR,
          w * DPR,
          h * DPR,
        );
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    img.src = url;
  });
}

// * Stamp helpers

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
    ctx,
    canvas,
    DPR,
    "Disclaimer: This map is not intended to replace any official data but is for planning purposes only. Not for legal or navigational use.",
  );
}

function stampDateTime(ctx, canvas, DPR) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  stampBadge(ctx, canvas, DPR, `Captured: ${dateStr} · ${timeStr}`, true);
}

let _logoImg;
function loadLogo() {
  if (_logoImg !== undefined) return Promise.resolve(_logoImg);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve((_logoImg = img));
    img.onerror = () => resolve((_logoImg = null));
    img.src = "./res/denr_logo.png";
  });
}

// Top-right letterhead badge: logo, full agency name, and CAR subheading — sized and weighted to stand out.
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
    ctx.drawImage(
      logo,
      cursorX,
      barY + (barH - logoSize) / 2,
      logoSize,
      logoSize,
    );
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

// * Panel capture helper  (Problem C — fixed panel layering)

async function drawDetailsPanelOntoCanvas(destCanvas, DPR) {
  const panel = document.getElementById("details-panel");
  if (!panel || panel.classList.contains("hidden")) return;

  panel.style.position = "absolute";
  const panelCanvas = await html2canvas(panel, {
    useCORS: true,
    allowTaint: true,
    scale: DPR,
    logging: false,
    backgroundColor: null,
  });
  panel.style.position = "";

  const { left, top } = panel.getBoundingClientRect();
  destCanvas.getContext("2d").drawImage(panelCanvas, left * DPR, top * DPR);
}

// * Capture

async function captureWithMap(map) {
  const screenshotBtn = document.getElementById("btn-screenshot");

  const toHide = [
    document.getElementById("panel-dock"),
    document.querySelector(".basemap-switcher"),
    document.querySelector(".controls-trigger-container"),
  ].filter(Boolean);

  // Loading state
  screenshotBtn.style.display = "none";
  screenshotBtn.classList.add("screenshot-btn--loading");
  screenshotBtn.disabled = true;
  lucide.createIcons();

  toHide.forEach((el) => (el.style.visibility = "hidden"));

  // Hide EVERY active SVG renderer (one per custom pane), not just the
  // legacy single map._renderer — see getActiveSvgRenderers for why.
  const renderers = getActiveSvgRenderers(map);
  renderers.forEach((r) => (r._container.style.visibility = "hidden"));

  const restoreTiles = fixTilesForCapture(map);
  await new Promise((r) => requestAnimationFrame(r));

  const restore = () => {
    restoreTiles();
    renderers.forEach((r) => (r._container.style.visibility = ""));
    toHide.forEach((el) => (el.style.visibility = ""));
  };

  try {
    const DPR = window.devicePixelRatio || 1;

    // Step 1 — tiles + UI (SVG hidden)
    const canvas = await html2canvas(document.body, {
      useCORS: true,
      allowTaint: true,
      scale: DPR,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: window.innerWidth,
      windowWidth: window.innerWidth,
      height: window.innerHeight,
      windowHeight: window.innerHeight,
    });

    restore();

    // Step 2 — SVG overlay(s), composited in the same z-order as the live map
    for (const renderer of renderers) {
      await drawSvgOverlayOntoCanvas(map, renderer, canvas, DPR);
    }

    // Step 2b — details panel on top
    await drawDetailsPanelOntoCanvas(canvas, DPR);

    // Step 3 — stamps
    const ctx = canvas.getContext("2d");
    await stampLogo(ctx, canvas, DPR);
    stampDisclaimer(ctx, canvas, DPR);
    stampDateTime(ctx, canvas, DPR);

    _capturedCanvas = canvas;
    document.getElementById("screenshot-preview-img").src =
      canvas.toDataURL("image/png");
    document
      .getElementById("screenshot-preview-modal")
      .classList.remove("hidden");
  } catch (err) {
    console.error("[Screenshot] Capture failed:", err);
    restore();
  } finally {
    screenshotBtn.style.display = "block";
    screenshotBtn.innerHTML = '<i data-lucide="camera"></i>';
    screenshotBtn.classList.remove("screenshot-btn--loading");
    screenshotBtn.disabled = false;
    lucide.createIcons();
  }
}
