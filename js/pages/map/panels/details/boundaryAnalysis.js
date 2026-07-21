import { AppState } from "../../../../base/config.js";
import { VALUE_OVERRIDES } from "./attributeConfig.js";
import { getFeatureName } from "../../../../shared/utils/featureNaming.js";

let activeCalculationId = 0;

/**
 * Determine the category/group value of a feature for sorting and grouping.
 */
function getFeatureGroupKey(feature, colorField, layerName) {
  if (
    colorField &&
    feature.properties &&
    feature.properties[colorField] !== undefined &&
    feature.properties[colorField] !== null
  ) {
    return String(feature.properties[colorField]);
  }
  // Fallback to common descriptive attributes
  const fields = [
    "LCM_CLASS",
    "DESCRIPT",
    "PPF_Type",
    "sw_code",
    "pa_name",
    "WATERSHED",
    "Erosion",
  ];
  for (const f of fields) {
    if (
      feature.properties &&
      feature.properties[f] !== undefined &&
      feature.properties[f] !== null
    ) {
      return String(feature.properties[f]);
    }
  }
  const featName = getFeatureName(feature.properties, "");
  if (featName) return featName;
  return layerName;
}

/**
 * Get color for the specific category from layer configuration styles or codeColors.
 */
function getFeatureColor(feature, groupKey, layerInfo) {
  if (
    layerInfo.codeColors &&
    groupKey !== undefined &&
    layerInfo.codeColors[groupKey]
  ) {
    return layerInfo.codeColors[groupKey];
  }
  // Try mapping code if colorField exists but was formatted/stringified
  if (
    layerInfo.codeColors &&
    layerInfo.colorField &&
    feature.properties &&
    feature.properties[layerInfo.colorField] !== undefined
  ) {
    const rawVal = feature.properties[layerInfo.colorField];
    if (layerInfo.codeColors[rawVal]) return layerInfo.codeColors[rawVal];
  }
  if (layerInfo.style) {
    if (layerInfo.style.fillColor) return layerInfo.style.fillColor;
    if (layerInfo.style.color) return layerInfo.style.color;
  }
  return "#3b82f6"; // Default blue
}

/**
 * Formats area value in square meters to a human-readable string in hectares (ha) or square meters.
 */
function formatArea(sqM) {
  const hectares = sqM / 10000;
  if (hectares >= 0.01) {
    return `${hectares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
  }
  return `${sqM.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

/**
 * Renders the finalized overlap analysis results inside a layer's card.
 */
function renderLayerResults(card, layerInfo, groups, totalAreaSqM) {
  const sortedGroups = Object.entries(groups)
    .map(([key, data]) => ({
      key,
      areaSqM: data.areaSqM,
      color: data.color,
      percentage: Math.min(100, (data.areaSqM / totalAreaSqM) * 100),
    }))
    .filter((g) => g.areaSqM > 0.01)
    .sort((a, b) => b.areaSqM - a.areaSqM);

  if (sortedGroups.length === 0) {
    card.innerHTML = `
      <div class="layer-analysis-title">${layerInfo.name}</div>
      <div class="empty-state" style="padding: 10px 0;">No overlapping area found (0% overlap).</div>
    `;
    return;
  }

  let html = `<div class="layer-analysis-title">${layerInfo.name}</div>`;
  html += `<div class="analysis-items-container">`;

  for (const g of sortedGroups) {
    let label = g.key;
    // Map code to descriptive value if override exists
    if (layerInfo.colorField && VALUE_OVERRIDES[layerInfo.colorField]) {
      label = VALUE_OVERRIDES[layerInfo.colorField][g.key] || g.key;
    }

    const areaStr = formatArea(g.areaSqM);
    const pctStr = `${g.percentage.toFixed(1)}%`;

    html += `
      <div class="analysis-item">
        <div class="analysis-item-header">
          <div class="analysis-item-label">
            <span class="color-indicator" style="background-color: ${g.color};"></span>
            <span>${label}</span>
          </div>
          <div class="analysis-item-stats">
            <span>${areaStr}</span>
            <span style="margin-left: 6px; color: var(--text-muted);">(${pctStr})</span>
          </div>
        </div>
        <div class="analysis-progress-bg">
          <div class="analysis-progress-bar" style="width: ${g.percentage}%; background-color: ${g.color};"></div>
        </div>
      </div>
    `;
  }

  html += `</div>`;
  card.innerHTML = html;
}

/**
 * Performs sequential, chunked intersection analysis on all checked and loaded layers
 * against the currently selected boundary polygon.
 */
export function updateBoundaryAnalysis() {
  const container = document.getElementById("overlapping-analysis-container");
  if (!container) return;

  // Increment calculation token to cancel any previous runs
  activeCalculationId++;
  const currentCalcId = activeCalculationId;

  const selectedBoundary = AppState.selectedBoundary;
  if (!selectedBoundary || !selectedBoundary.feature) {
    container.innerHTML = "";
    return;
  }

  // Find all other checked, loaded layers (excluding the active selection's own layer)
  const layersToAnalyze = Object.keys(AppState.layers).filter((key) => {
    const layer = AppState.layers[key];
    return (
      layer.checked &&
      layer.loaded &&
      layer.leafletLayer &&
      key !== selectedBoundary.layerKey
    );
  });

  if (layersToAnalyze.length === 0) {
    container.innerHTML = `
      <div class="overlapping-analysis-section">
        <h3 class="analysis-section-title">Overlapping Layers Analysis</h3>
        <div class="empty-state">
          No other checked layers to analyze. Check layers (e.g. Climate, Slope) to see overlapping statistics.
        </div>
      </div>
    `;
    return;
  }

  // Render the initial section framework
  container.innerHTML = `
    <div class="overlapping-analysis-section">
      <h3 class="analysis-section-title">Overlapping Layers Analysis</h3>
      <div id="analysis-results-list"></div>
    </div>
  `;

  const resultsList = document.getElementById("analysis-results-list");
  const selectedFeature = selectedBoundary.feature;
  const turf = window.turf;

  if (!turf) {
    resultsList.innerHTML = `<div class="empty-state">Spatial analysis library (Turf.js) not available.</div>`;
    return;
  }

  const totalAreaSqM = turf.area(selectedFeature);
  if (totalAreaSqM <= 0) {
    resultsList.innerHTML = `<div class="empty-state">Invalid boundary polygon area.</div>`;
    return;
  }

  let layerIndex = 0;

  function processNextLayer() {
    if (currentCalcId !== activeCalculationId) return;

    if (layerIndex >= layersToAnalyze.length) {
      return; // Calculations complete!
    }

    const key = layersToAnalyze[layerIndex];
    const layerInfo = AppState.layers[key];

    if (!layerInfo.data || !layerInfo.data.features) {
      layerIndex++;
      processNextLayer();
      return;
    }

    // Create a card for this layer with a loading indicator
    const cardId = `analysis-card-${key}`;
    let card = document.getElementById(cardId);
    if (!card) {
      card = document.createElement("div");
      card.id = cardId;
      card.className = "layer-analysis-card";
      resultsList.appendChild(card);
    }

    card.innerHTML = `
      <div class="layer-analysis-title">${layerInfo.name}</div>
      <div class="analysis-loading">
        <div class="layer-loader" style="margin-right: 0;"></div>
        <span>Analyzing overlap...</span>
      </div>
    `;

    const targetFeatures = layerInfo.data.features;
    const colorField = layerInfo.colorField;
    const layerName = layerInfo.name;

    // Phase 1: Fast bounding box pre-filter using Turf
    let boundaryBbox;
    try {
      boundaryBbox = turf.bbox(selectedFeature);
    } catch (err) {
      console.error("Failed to compute boundary bbox:", err);
      card.innerHTML = `
        <div class="layer-analysis-title">${layerInfo.name}</div>
        <div class="empty-state" style="padding: 10px 0;">Failed to analyze boundary geometry.</div>
      `;
      layerIndex++;
      processNextLayer();
      return;
    }

    const candidateFeatures = [];
    for (const f of targetFeatures) {
      if (!f.geometry) continue;
      // Cache bbox calculation on the feature to speed up subsequent queries
      if (!f._bbox) {
        try {
          f._bbox = turf.bbox(f);
        } catch (e) {
          continue;
        }
      }
      const b1 = boundaryBbox;
      const b2 = f._bbox;
      // Bbox intersection test
      const overlaps = !(
        b1[0] > b2[2] ||
        b1[2] < b2[0] ||
        b1[1] > b2[3] ||
        b1[3] < b2[1]
      );
      if (overlaps) {
        candidateFeatures.push(f);
      }
    }

    if (candidateFeatures.length === 0) {
      card.innerHTML = `
        <div class="layer-analysis-title">${layerInfo.name}</div>
        <div class="empty-state" style="padding: 10px 0;">No overlapping area found (0% overlap).</div>
      `;
      layerIndex++;
      processNextLayer();
      return;
    }

    // Phase 2: Chunked Turf.js intersection processing
    let itemIndex = 0;
    const batchSize = 40; // Processes 40 features per event loop cycle
    const groups = {};

    function runBatch() {
      if (currentCalcId !== activeCalculationId) return;

      const limit = Math.min(itemIndex + batchSize, candidateFeatures.length);
      for (; itemIndex < limit; itemIndex++) {
        const f = candidateFeatures[itemIndex];
        try {
          const intersection = turf.intersect(selectedFeature, f);
          if (intersection) {
            const area = turf.area(intersection);
            if (area > 0.01) {
              const gKey = getFeatureGroupKey(f, colorField, layerName);
              if (!groups[gKey]) {
                groups[gKey] = {
                  areaSqM: 0,
                  color: getFeatureColor(f, gKey, layerInfo),
                };
              }
              groups[gKey].areaSqM += area;
            }
          }
        } catch (err) {
          // Gracefully continue on singular geometry errors (e.g. self-intersections)
          console.warn(
            "Turf intersection skipped for feature due to geometry exception:",
            err,
          );
        }
      }

      if (itemIndex < candidateFeatures.length) {
        const pct = Math.round((itemIndex / candidateFeatures.length) * 100);
        card.innerHTML = `
          <div class="layer-analysis-title">${layerInfo.name}</div>
          <div class="analysis-loading">
            <div class="layer-loader" style="margin-right: 0;"></div>
            <span>Analyzing overlap... ${pct}%</span>
          </div>
        `;
        setTimeout(runBatch, 0);
      } else {
        // Render completed stats for this layer, then advance to next layer in queue
        renderLayerResults(card, layerInfo, groups, totalAreaSqM);
        layerIndex++;
        processNextLayer();
      }
    }

    runBatch();
  }

  processNextLayer();
}
