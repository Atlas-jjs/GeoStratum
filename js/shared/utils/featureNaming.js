/* *
 * Title for the feature details panel

 * @param {Object} properties - GeoJSON feature properties
 * @param {string} key - Layer key (unused, kept for API compatibility)
 * @returns {string|null}
 */
export function getFeatureName(properties, key) {
  // Default Layers
  if (properties.Muni_City) return properties.Muni_City;
  if (properties.Municipali) return properties.Municipali;
  if (properties.PROVINCE) return properties.PROVINCE;
  if (properties.Province) return properties.Province;

  // Imported/Hard-coded Layers
  if (properties.Erosion) return properties.Erosion;
  if (properties.DESCRIPT) return properties.DESCRIPT;
  if (properties.PPF_Type) return properties.PPF_Type;
  if (properties.CODE) return properties.CODE;
  if (properties.LCM_CLASS) return properties.LCM_CLASS;
  if (properties.Layer) return properties.Layer;
  if (properties.sw_code) return properties.sw_code;
  if (properties.WATERSHED) return properties.WATERSHED;
  if (properties.pa_name) return properties.pa_name;
  return null;
}
