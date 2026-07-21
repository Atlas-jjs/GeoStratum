/* *
 * Attribute names that are always hidden, regardless of layer.
 * Matching is normalized (case-insensitive, trailing numeric suffixes
 * stripped) so duplicate-field variants exported by GIS tools — e.g.
 * "Remarks1", "Remarks_2", "Layer1" — are caught by their base entry
 * ("REMARKS", "LAYER") without needing every variant listed here.
 */
export const HIDDEN_ATTRIBUTES = new Set([
  "PERIMETER",
  "X_COORD",
  "Y_COORD",
  "LONGITUDE",
  "LATITUDE",
  "LAT",
  "LON",
  "LONG",
  "HECTARES",
  "SHAPE_AREA",
  "REMARKS",
  "LAYER",
  "PENRO",
  "SERIES",
  "AGG",
  "FID",
  "COMMODTY_G",
  "SYMBOL",
  "PA_ID",
  "ENR_CLCODE",
]);

/* *
 * Generic patterns hidden on every layer regardless of exact field name
 * (GIS auto-generated fields like Shape_Length, Shape_Leng, OBJECTID_1).
 */
export const GENERIC_HIDDEN_PATTERNS = [/^shape_/i, /objectid/i];

/* *
 * Per-layer attribute blocklists keyed by layer name.
 * Useful for hiding fields that are meaningful globally but
 * irrelevant for a specific layer.
 */
export const LAYER_HIDDEN_ATTRIBUTES = {
  "NAMRIA Provinces": new Set(["PERIMETER", "Shape_Area"]),
  "NAMRIA Municipalities": new Set(["PERIMETER", "Shape_Area"]),
  "CAD Provinces": new Set(["PERIMETER", "Shape_Area"]),
  "CAD Municipalities": new Set(["PERIMETER", "Shape_Area"]),
};

/* *
 * Known keys get an exact label override; anything else falls back to
 * clean sentence case ("PA_NAME" -> "Pa name") in formatKeyLabel.
 */
export const CUSTOM_LABELS = {
  MUNI_CITY: "Municipality",
  Muni_City: "Municipality",
  PSGC: "PSGC",
  CENRO: "CENRO",
  NAME_PART: "PO Partner",
  YR_ESTAB: "Year Established",
  COMMODITY: "Commodity",
  SPECIES: "Species Planted",
  AREA_HA: "Area (Hectares)",
  AREA__HA_: "Area (Hectares)", // Climate GeoJSON
  Hectares: "Area (Hectares)",
  REGION: "Region",
  Province: "Province",
  MUNICIPALI: "Municipality",
  Municipality: "Municipality",
  BARANGAY: "Barangay",
  TENURE: "Type of Tenure",
  STAT_REG: "Registration Status",
  CTRCT_ID: "Contract ID",
  UNIQ_ID: "Unique ID",
  CONT_PERS: "Contact Person",
  DATE_ISSD: "Date Issued",
  NAME_FAM: "Name Family",
  YR_CD: "Year Code",
  AREA_DEV: "Area Developed",
  W_NAME: "Watershed",
  DATE_EXPY: "Date Expiry",
  LndslideSu: "Landslide Susceptibility",
  FloodSusc: "Flood Susceptibility",
  TYPE_DESC: "Description",
  DESCRIPT: "Description",
  pa_name: "Protected Area",
  PSGC_C: "PSGC",
  CENRO_Cov: "CENRO",
  CENR_Cov: "CENRO",
  LCM_CLASS: "Land Classification",
  PART_TYP: "Part Type",
  AREA_CD: "Area Code",
};

/* *
 * Per-key raw-value -> display-value overrides, for fields where the raw
 * value is a code that needs translating (e.g. category codes, flags).
 * Mirrors CUSTOM_LABELS above — match on the literal raw property key,
 * then the literal raw value. Numeric raw values still need quoting
 * here since object keys are always strings, e.g.:
 *   STAT_REG: { "1": "Registered", "0": "Unregistered" },
 */
export const VALUE_OVERRIDES = {
  FloodSusc: {
    LF: "Low Flooding",
    MF: "Medium Flooding",
    HF: "High Flooding",
    VHF: "Very High Flooding",
  },
  REGION: {
    CAR: "Cordillera Administrative Region",
  },
  region: {
    CAR: "Cordillera Administrative Region",
  },
  CODE: {
    "1st Type": "Type 1",
    "2nd Type": "Type 2",
    "3rd Type": "Type 3",
    "4th Type": "Type 4",
  },
  LndslideSu: {
    DB: "Debris Flow",
    MDF: "Medium Debris Flow",
    LL: "Low Landslide",
    ML: "Medium Landslide",
    HL: "High Landslide",
    VHL: "Very High Landslide",
  },
};

/* *
 * Keys whose values represent area/hectares and should always be
 * rounded to exactly 2 decimal places, regardless of magnitude.
 */
export const AREA_VALUE_KEYS = new Set([
  "AREA_HA",
  "AREA__HA_",
  "HECTARES",
  "AREA_DEV",
]);

/* *
 * Values that should be treated as "empty" and excluded from display,
 * beyond a strict empty string — covers common GIS export placeholders.
 */
export const EMPTY_VALUE_STRINGS = new Set([
  "null",
  "n/a",
  "na",
  "none",
  "-",
  "--",
]);
