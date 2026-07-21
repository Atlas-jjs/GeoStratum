"use strict";

import { login, register, sendOtp, resetPassword } from "../api/authApi.js";
import {
  getAuthState,
  onAuthStateChange,
  logoutUser,
  updateAuthState,
} from "../utils/auth.js";
import { showToast } from "../utils/toast.js";

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
    dragging: false,
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
    if (!L.Browser.mobile) {
      map.dragging.enable();
    }
  } else {
    map.fitBounds(
      [
        [10.5, 117.5],
        [19.5, 124.5],
      ],
      { animate: false },
    );
    window.setTimeout(function () {
      map.once("moveend", function () {
        if (!L.Browser.mobile) {
          map.dragging.enable();
        }
      });
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

// * ==================== Authentication UI Controller ====================

function initAuthUI() {
  const modal = document.getElementById("auth-modal");
  const cardLogin = document.getElementById("card-login");
  const cardRegister = document.getElementById("card-register");
  const cardResetRequest = document.getElementById("card-reset-request");
  const cardResetVerify = document.getElementById("card-reset-verify");
  const cardResetSuccess = document.getElementById("card-reset-success");

  const headerContainer = document.getElementById("auth-header-container");
  const heroCtaContainer = document.querySelector(".hero-cta");
  const secondCtaContainer = document.querySelector(".cta-band .hero-cta");

  let resetEmailValue = "";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateInput(inputEl, condition, errorMsg, errorEl) {
    if (!condition) {
      inputEl.classList.add("invalid-field");
      if (errorEl) {
        errorEl.textContent = errorMsg;
        errorEl.style.display = "block";
      }
      return false;
    } else {
      inputEl.classList.remove("invalid-field");
      return true;
    }
  }

  function clearValidationErrors() {
    if (!modal) return;
    const inputs = modal.querySelectorAll("input");
    inputs.forEach((input) => {
      input.classList.remove("invalid-field");
    });
    const errorMsgs = modal.querySelectorAll(".auth-error-msg");
    errorMsgs.forEach((err) => {
      err.textContent = "";
      err.style.display = "none";
    });
  }

  function attachInputClearHandlers() {
    if (!modal) return;
    const inputs = modal.querySelectorAll("input");
    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        input.classList.remove("invalid-field");
      });
    });
  }

  // Show / Hide Modals
  function openModal(mode = "login") {
    modal.classList.remove("hidden");
    showCard(mode);
  }

  function closeModal() {
    modal.classList.add("hidden");
    document.getElementById("form-login").reset();
    document.getElementById("form-register").reset();
    document.getElementById("form-reset-request").reset();
    document.getElementById("form-reset-verify").reset();
    clearValidationErrors();
  }

  function showCard(mode) {
    cardLogin.classList.add("hidden");
    cardRegister.classList.add("hidden");
    cardResetRequest.classList.add("hidden");
    cardResetVerify.classList.add("hidden");
    cardResetSuccess.classList.add("hidden");

    if (mode === "login") {
      cardLogin.classList.remove("hidden");
    } else if (mode === "register") {
      cardRegister.classList.remove("hidden");
    } else if (mode === "reset-request") {
      cardResetRequest.classList.remove("hidden");
    } else if (mode === "reset-verify") {
      cardResetVerify.classList.remove("hidden");
    } else if (mode === "reset-success") {
      cardResetSuccess.classList.remove("hidden");
    }

    clearValidationErrors();
    initIcons();
  }

  attachInputClearHandlers();

  // Bind close buttons
  document
    .getElementById("btn-close-login")
    .addEventListener("click", closeModal);
  document
    .getElementById("btn-close-register")
    .addEventListener("click", closeModal);
  document
    .getElementById("btn-close-reset-request")
    .addEventListener("click", closeModal);
  document
    .getElementById("btn-close-reset-verify")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("btn-close-reset-success")
    ?.addEventListener("click", closeModal);

  // Close modal on click outside card
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Bind toggle links
  document
    .getElementById("link-to-register")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      showCard("register");
    });
  document.getElementById("link-to-reset")?.addEventListener("click", (e) => {
    e.preventDefault();
    showCard("reset-request");
  });
  document.getElementById("link-to-login")?.addEventListener("click", (e) => {
    e.preventDefault();
    showCard("login");
  });

  // Bind class-based link-to-login elements
  document.querySelectorAll(".link-to-login").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      showCard("login");
    });
  });

  // Success modal Sign In button
  document
    .getElementById("btn-reset-success-signin")
    ?.addEventListener("click", (e) => {
      e.preventDefault();
      showCard("login");
    });

  // --- Form Submissions ---

  // Login
  document
    .getElementById("form-login")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailEl = document.getElementById("login-email");
      const passwordEl = document.getElementById("login-password");
      const errorEl = document.getElementById("login-error");

      errorEl.textContent = "";
      errorEl.style.display = "none";

      let valid = true;
      if (
        !validateInput(
          passwordEl,
          passwordEl.value.trim() !== "",
          "Password is required.",
          errorEl,
        )
      )
        valid = false;
      if (
        !validateInput(
          emailEl,
          emailEl.value.trim() !== "",
          "Email address is required.",
          errorEl,
        )
      )
        valid = false;
      else if (
        !validateInput(
          emailEl,
          emailRegex.test(emailEl.value.trim()),
          "Please enter a valid email address.",
          errorEl,
        )
      )
        valid = false;

      if (!valid) return;

      try {
        const data = await login(emailEl.value.trim(), passwordEl.value);
        updateAuthState(true, data.user);
        closeModal();
        window.location.reload();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "block";
      }
    });

  // Register
  document
    .getElementById("form-register")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailEl = document.getElementById("register-email");
      const passwordEl = document.getElementById("register-password");
      const confirmPasswordEl = document.getElementById(
        "register-confirm-password",
      );
      const errorEl = document.getElementById("register-error");

      errorEl.textContent = "";
      errorEl.style.display = "none";

      let valid = true;
      if (
        !validateInput(
          confirmPasswordEl,
          confirmPasswordEl.value !== "",
          "Confirm Password is required.",
          errorEl,
        )
      )
        valid = false;
      if (
        !validateInput(
          passwordEl,
          passwordEl.value !== "",
          "Password is required.",
          errorEl,
        )
      )
        valid = false;
      else if (
        !validateInput(
          passwordEl,
          passwordEl.value.length >= 6,
          "Password must be at least 6 characters long.",
          errorEl,
        )
      )
        valid = false;

      if (
        !validateInput(
          emailEl,
          emailEl.value.trim() !== "",
          "Email address is required.",
          errorEl,
        )
      )
        valid = false;
      else if (
        !validateInput(
          emailEl,
          emailRegex.test(emailEl.value.trim()),
          "Please enter a valid email address.",
          errorEl,
        )
      )
        valid = false;

      if (valid && passwordEl.value !== confirmPasswordEl.value) {
        validateInput(
          confirmPasswordEl,
          false,
          "Passwords do not match.",
          errorEl,
        );
        valid = false;
      }

      if (!valid) return;

      try {
        const data = await register(emailEl.value.trim(), passwordEl.value);
        updateAuthState(true, data.user);
        closeModal();
        window.location.reload();
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "block";
      }
    });

  // Reset Step 1: Request OTP
  document
    .getElementById("form-reset-request")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailEl = document.getElementById("reset-email");
      const errorEl = document.getElementById("reset-request-error");

      errorEl.textContent = "";
      errorEl.style.display = "none";

      let valid = true;
      if (
        !validateInput(
          emailEl,
          emailEl.value.trim() !== "",
          "Email address is required.",
          errorEl,
        )
      )
        valid = false;
      else if (
        !validateInput(
          emailEl,
          emailRegex.test(emailEl.value.trim()),
          "Please enter a valid email address.",
          errorEl,
        )
      )
        valid = false;

      if (!valid) return;

      // Switch to verify card immediately — no wait for SMTP
      showCard("reset-verify");

      // Fire OTP email in the background
      sendOtp(emailEl.value.trim())
        .then(() => {
          showToast("OTP code sent to your email address.", "success");
        })
        .catch((err) => {
          showToast(
            err.message || "Failed to send OTP. Please try again.",
            "error",
          );
        });

      resetEmailValue = emailEl.value.trim();
    });

  // Reset Step 2: Verify OTP & Reset
  document
    .getElementById("form-reset-verify")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const otpEl = document.getElementById("reset-otp");
      const newPasswordEl = document.getElementById("reset-new-password");
      const confirmPasswordEl = document.getElementById(
        "reset-confirm-password",
      );
      const errorEl = document.getElementById("reset-verify-error");

      errorEl.textContent = "";
      errorEl.style.display = "none";

      let valid = true;
      if (
        !validateInput(
          confirmPasswordEl,
          confirmPasswordEl.value !== "",
          "Confirm New Password is required.",
          errorEl,
        )
      )
        valid = false;
      if (
        !validateInput(
          newPasswordEl,
          newPasswordEl.value !== "",
          "New Password is required.",
          errorEl,
        )
      )
        valid = false;
      else if (
        !validateInput(
          newPasswordEl,
          newPasswordEl.value.length >= 6,
          "Password must be at least 6 characters long.",
          errorEl,
        )
      )
        valid = false;

      if (
        !validateInput(
          otpEl,
          otpEl.value.trim() !== "",
          "OTP is required.",
          errorEl,
        )
      )
        valid = false;
      else if (
        !validateInput(
          otpEl,
          /^\d{6}$/.test(otpEl.value.trim()),
          "OTP must be a 6-digit number.",
          errorEl,
        )
      )
        valid = false;

      if (valid && newPasswordEl.value !== confirmPasswordEl.value) {
        validateInput(
          confirmPasswordEl,
          false,
          "Passwords do not match.",
          errorEl,
        );
        valid = false;
      }

      if (!valid) return;

      try {
        await resetPassword(
          resetEmailValue,
          otpEl.value.trim(),
          newPasswordEl.value,
        );
        showCard("reset-success");
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "block";
      }
    });

  // --- Listen to Auth State Changes ---

  onAuthStateChange((state) => {
    // 1. Render Navigation Bar elements
    if (state.loggedIn) {
      headerContainer.innerHTML = `
        <div class="auth-user-pill">
          <span class="user-greeting"><strong>${state.user.email}</strong></span>
          <button id="btn-logout" class=" btn-outline btn-logout-nav" title="Log Out">
            <i data-lucide="log-out"></i>
            <span>Sign Out</span>
          </button>
        </div>
      `;
      document.getElementById("btn-logout").addEventListener("click", () => {
        logoutUser().then(() => {
          window.location.reload();
        });
      });
    } else {
      headerContainer.innerHTML = `
        <button id="btn-signin" class="btn btn-primary btn-signin-nav">
          <i data-lucide="log-in"></i>
          Sign In
        </button>
      `;
      document.getElementById("btn-signin").addEventListener("click", () => {
        openModal("login");
      });
    }

    // 2. Render Hero & Band CTA buttons
    const ctaHtml = state.loggedIn
      ? `
        <a class="btn btn-primary" href="page/map.html" rel="noopener">
          Go to Map
          <i data-lucide="arrow-up-right"></i>
        </a>
      `
      : `
        <a class="btn btn-primary" href="page/map.html" rel="noopener">
          Launch the Map
          <i data-lucide="arrow-up-right"></i>
        </a>
      `;

    if (heroCtaContainer) heroCtaContainer.innerHTML = ctaHtml;
    if (secondCtaContainer) secondCtaContainer.innerHTML = ctaHtml;

    initIcons();
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initIcons();
  initHeroMap();
  initReveals();
  initTopbarScroll();
  initAuthUI();
});
