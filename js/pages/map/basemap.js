export const BASEMAPS = {
  satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
      maxZoom: 19,
    },
  ),
  street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  hybrid: L.layerGroup([
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
        maxZoom: 19,
      },
    ),
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        opacity: 0.85,
      },
    ),
  ]),
  topo: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: '&copy; <a href="https://esri.com">Esri</a>',
      maxZoom: 17,
    },
  ),
};

export function initBasemapSwitcher(map, initialBasemap, onChange) {
  const container = document.getElementById("basemap-switcher");
  const trigger = container.querySelector(".bm-trigger");
  const menu = container.querySelector(".bm-menu");
  const current = container.querySelector("#bm-current");

  const dropdownButtons = menu.querySelectorAll("button");
  const tabButtons = container.querySelectorAll(".bm-tabs .bm-btn");

  let currentBasemap = initialBasemap;

  const labels = {
    satellite: "Satellite",
    hybrid: "Hybrid",
    street: "Open Street",
    topo: "Topography",
  };

  // ! Prevent Leaflet from stealing mouse events
  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  function switchBasemap(key) {
    if (currentBasemap) {
      map.removeLayer(currentBasemap);
    }

    currentBasemap = BASEMAPS[key];
    currentBasemap.addTo(map);

    current.textContent = labels[key];

    dropdownButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.basemap === key);
    });

    tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.basemap === key);
    });

    menu.classList.remove("open");
    trigger.classList.remove("open");

    onChange?.(currentBasemap);
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
    trigger.classList.toggle("open");
  });

  dropdownButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      switchBasemap(btn.dataset.basemap);
    });
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      switchBasemap(btn.dataset.basemap);
    });
  });

  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) {
      menu.classList.remove("open");
      trigger.classList.remove("open");
    }
  });

  // Set initial state
  const initialKey = Object.keys(BASEMAPS).find(
    (key) => BASEMAPS[key] === initialBasemap,
  );

  if (initialKey) {
    current.textContent = labels[initialKey];

    dropdownButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.basemap === initialKey);
    });

    tabButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.basemap === initialKey);
    });
  }
}
