import {
  HIDDEN_ATTRIBUTES,
  GENERIC_HIDDEN_PATTERNS,
  LAYER_HIDDEN_ATTRIBUTES,
  EMPTY_VALUE_STRINGS,
} from "./attributeConfig.js";

/* *
 * Strips a trailing numeric suffix (with optional separator) and
 * uppercases, so "Remarks1", "Remarks_2", "AREA_HA_2", and "REMARKS"
 * all normalize to the same key for blocklist/dedupe comparison.
 * @param {string} key
 * @returns {string}
 */
export function normalizeAttributeKey(key) {
  return key
    .trim()
    .toUpperCase()
    .replace(/[_\s]*\d+$/, "");
}

/* *
 * Determine whether a given attribute key should be hidden, checking
 * generic GIS noise fields, the global blocklist, and any layer-specific
 * blocklist for the current layer.
 * @param {string} key
 * @param {string} layerName
 * @returns {boolean}
 */
export function shouldHideAttribute(key, layerName) {
  if (GENERIC_HIDDEN_PATTERNS.some((pattern) => pattern.test(key))) {
    return true;
  }

  const normalized = normalizeAttributeKey(key);

  if (HIDDEN_ATTRIBUTES.has(normalized)) return true;

  const layerBlocklist = LAYER_HIDDEN_ATTRIBUTES[layerName];
  if (layerBlocklist) {
    for (const blocked of layerBlocklist) {
      if (normalizeAttributeKey(blocked) === normalized) return true;
    }
  }

  return false;
}

/* *
 * Collapses duplicate-suffixed fields (e.g. "AREA_HA", "AREA_HA_1",
 * "AREA_HA2") down to a single entry — whichever appears first — by
 * grouping on the same normalized key used for hiding.
 * @param {Array<[string, *]>} entries
 * @returns {Array<[string, *]>}
 */
export function dedupeByBaseKey(entries) {
  const seenGroups = new Set();
  const deduped = [];

  for (const entry of entries) {
    const groupKey = normalizeAttributeKey(entry[0]);
    if (seenGroups.has(groupKey)) continue;
    seenGroups.add(groupKey);
    deduped.push(entry);
  }

  return deduped;
}

/* *
 * Determine whether a raw or formatted attribute value should be
 * treated as empty and excluded from display.
 * @param {*} val
 * @returns {boolean}
 */
export function isEmptyValue(val) {
  if (val === null || val === undefined) return true;
  if (typeof val === "number" && Number.isNaN(val)) return true;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return true;
    if (EMPTY_VALUE_STRINGS.has(trimmed.toLowerCase())) return true;
  }
  return false;
}
