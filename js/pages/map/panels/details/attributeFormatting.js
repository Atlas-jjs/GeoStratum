import {
  CUSTOM_LABELS,
  VALUE_OVERRIDES,
  AREA_VALUE_KEYS,
} from "./attributeConfig.js";
import { normalizeAttributeKey } from "./attributeUtils.js";

/* *
 * Convert property keys into display labels.
 * Known keys get an exact override; anything else falls back to clean
 * sentence case ("PA_NAME" -> "Pa name"). Add an entry to CUSTOM_LABELS
 * (in attributeConfig.js) to override the default for any specific key.
 * @param {string} key
 * @returns {string}
 */
export function formatKeyLabel(key) {
  if (CUSTOM_LABELS[key]) return CUSTOM_LABELS[key];

  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/* *
 * Round an area/hectare value to 2 decimal places for display.
 * Non-numeric or invalid input is returned unchanged.
 * @param {*} val
 * @returns {*}
 */
function formatAreaValue(val) {
  const num = typeof val === "number" ? val : parseFloat(val);
  if (Number.isNaN(num)) return val;

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* *
 * Resolve the display value for an attribute. Checks VALUE_OVERRIDES for
 * an exact match first; then area-specific 2-decimal formatting; then
 * falls back to the raw value, with thousands-separated formatting
 * applied to large numbers.
 * @param {string} key
 * @param {*} val
 * @returns {*}
 */
export function formatAttributeValue(key, val) {
  const overrides = VALUE_OVERRIDES[key];
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, val)) {
    return overrides[val];
  }

  if (
    AREA_VALUE_KEYS.has(normalizeAttributeKey(key)) &&
    typeof val === "number"
  ) {
    return formatAreaValue(val);
  }

  if (typeof val === "number" && val > 100) {
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  return val;
}
