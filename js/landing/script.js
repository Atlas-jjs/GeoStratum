"use strict";

var CAR_BOUNDS = [
  [15.95, 120.35],
  [18.35, 121.65],
];

var PROVINCES = [
  { name: "Abra", lat: 17.6, lng: 120.62 },
  { name: "Apayao", lat: 18.05, lng: 121.15 },
  { name: "Benguet", lat: 16.46, lng: 120.59 },
  { name: "Ifugao", lat: 16.8, lng: 121.12 },
  { name: "Kalinga", lat: 17.42, lng: 121.44 },
  { name: "Mountain Province", lat: 17.09, lng: 120.98 },
];

function initHeroMap() {
  var el = document.getElementById("hero-map");
  if (!el || typeof L === "undefined") return;

  var reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  var map = L.map(el, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,
    dragging: !L.Browser.mobile,
    doubleClickZoom: false,
    touchZoom: true,
    minZoom: 6,
    maxZoom: 12,
  });

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution:
        '&copy; <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics',
      maxZoom: 19,
    },
  ).addTo(map);

  map.attributionControl.setPrefix(false);

  var carBoundsLL = L.latLngBounds(CAR_BOUNDS);

  if (reduceMotion) {
    map.fitBounds(carBoundsLL, { padding: [20, 20] });
  } else {
    map.fitBounds(
      [
        [10.5, 117.5],
        [19.5, 124.5],
      ],
      { animate: false },
    );
    window.setTimeout(function () {
      map.flyToBounds(carBoundsLL, {
        padding: [20, 20],
        duration: 2.6,
      });
    }, 500);
  }

  PROVINCES.forEach(function (p) {
    var marker = L.circleMarker([p.lat, p.lng], {
      radius: 5,
      className: "province-marker",
      color: "rgba(255,255,255,0.85)",
      weight: 2,
      fillColor: "#19c08a",
      fillOpacity: 1,
    }).addTo(map);

    marker.bindTooltip(p.name, {
      className: "province-tip",
      direction: "top",
      offset: [0, -6],
    });
  });

  var readout = document.getElementById("coord-readout");
  if (readout) {
    map.on("mousemove", function (e) {
      var lat = e.latlng.lat.toFixed(4);
      var lng = e.latlng.lng.toFixed(4);
      readout.innerHTML =
        '<span class="label">Cursor</span> ' +
        Math.abs(lat) +
        "\u00B0 " +
        (lat >= 0 ? "N" : "S") +
        ", " +
        Math.abs(lng) +
        "\u00B0 " +
        (lng >= 0 ? "E" : "W");
    });
  }
}

function initReveals() {
  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || items.length === 0) {
    items.forEach(function (el) {
      el.classList.add("in");
    });
    return;
  }

  var obs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
  );

  items.forEach(function (el) {
    obs.observe(el);
  });
}

function initIcons() {
  if (typeof lucide === "undefined") return;
  lucide.createIcons();
}

function initTopbarScroll() {
  var topbar = document.getElementById("topbar");
  if (!topbar) return;

  function update() {
    if (window.scrollY > 8) {
      topbar.classList.add("scrolled");
    } else {
      topbar.classList.remove("scrolled");
    }
  }

  update();
  window.addEventListener("scroll", update, { passive: true });
}

document.addEventListener("DOMContentLoaded", function () {
  initIcons();
  initHeroMap();
  initReveals();
  initTopbarScroll();
});
