/*
 * Thin fetch() wrapper around the custom-layers REST API.
 * The API itself is a plain PHP script - see /server/layers/custom-layers.php.
 *
 * NOTE: this path is relative to the current page (no leading slash), so
 * it resolves correctly whether your project is served from the domain
 * root (http://localhost/) or a subfolder
 * (http://localhost/GeoHazard-Map_Refactor/). This points at the
 * "server" folder - rename this if you ever rename that folder.
 */

const API_BASE = "server/layers/custom-layers.php";

async function handleResponse(res) {
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(`Custom layers API error (${res.status}): ${message}`);
  }
  return res.json();
}

/* * Fetch all saved custom layers for a given panel ("cad" | "namria"). */
export function listCustomLayers(panel) {
  return fetch(`${API_BASE}?panel=${encodeURIComponent(panel)}`).then(
    handleResponse,
  );
}

/* * Persist a newly imported layer. Returns { id }. */
export function createCustomLayer(payload) {
  return fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(handleResponse);
}

/* * Update an already-saved layer's name/color/style/geometry. */
export function updateCustomLayer(id, payload) {
  return fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(handleResponse);
}

/* * Remove a saved layer from the database. */
export function deleteCustomLayer(id) {
  return fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).then(handleResponse);
}
