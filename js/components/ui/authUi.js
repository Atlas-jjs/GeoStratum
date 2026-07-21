import {
  login,
  register,
  sendOtp,
  resetPassword,
} from "../../api/authApi.js";
import {
  getAuthState,
  onAuthStateChange,
  logoutUser,
  updateAuthState,
} from "../../utils/auth.js";
import { showToast } from "../../utils/toast.js";

let modal = null;
let cardLogin = null;
let cardRegister = null;
let cardResetRequest = null;
let cardResetVerify = null;
let cardResetSuccess = null;
let btnMapAuth = null;
let cardConfirmLogout = null;
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
  inputs.forEach(input => {
    input.classList.remove("invalid-field");
  });
  const errorMsgs = modal.querySelectorAll(".auth-error-msg");
  errorMsgs.forEach(err => {
    err.textContent = "";
    err.style.display = "none";
  });
}

function attachInputClearHandlers() {
  if (!modal) return;
  const inputs = modal.querySelectorAll("input");
  inputs.forEach(input => {
    input.addEventListener("input", () => {
      input.classList.remove("invalid-field");
    });
  });
}

export function initMapAuthUI() {
  modal = document.getElementById("auth-modal");
  cardLogin = document.getElementById("card-login");
  cardRegister = document.getElementById("card-register");
  cardResetRequest = document.getElementById("card-reset-request");
  cardResetVerify = document.getElementById("card-reset-verify");
  cardResetSuccess = document.getElementById("card-reset-success");
  btnMapAuth = document.getElementById("btn-map-auth");
  cardConfirmLogout = document.getElementById("card-confirm-logout");

  if (!modal || !btnMapAuth) {
    console.error("Auth modal or button not found in map.html");
    return;
  }

  attachInputClearHandlers();

  // Bind Open/Close
  btnMapAuth.addEventListener("click", () => {
    const state = getAuthState();
    if (state.loggedIn) {
      openModal("confirm-logout");
    } else {
      openModal("login");
    }
  });

  document
    .getElementById("btn-cancel-signout")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("btn-confirm-signout")
    ?.addEventListener("click", () => {
      closeModal();
      logoutUser().then(() => {
        window.location.reload();
      });
    });

  document
    .getElementById("btn-close-login")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("btn-close-register")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("btn-close-reset-request")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("btn-close-reset-verify")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("btn-close-reset-success")
    ?.addEventListener("click", closeModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Toggles
  document.getElementById("link-to-register")?.addEventListener("click", (e) => {
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
      if (!validateInput(passwordEl, passwordEl.value.trim() !== "", "Password is required.", errorEl)) valid = false;
      if (!validateInput(emailEl, emailEl.value.trim() !== "", "Email address is required.", errorEl)) valid = false;
      else if (!validateInput(emailEl, emailRegex.test(emailEl.value.trim()), "Please enter a valid email address.", errorEl)) valid = false;

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
      const confirmPasswordEl = document.getElementById("register-confirm-password");
      const errorEl = document.getElementById("register-error");

      errorEl.textContent = "";
      errorEl.style.display = "none";

      let valid = true;
      if (!validateInput(confirmPasswordEl, confirmPasswordEl.value !== "", "Confirm Password is required.", errorEl)) valid = false;
      if (!validateInput(passwordEl, passwordEl.value !== "", "Password is required.", errorEl)) valid = false;
      else if (!validateInput(passwordEl, passwordEl.value.length >= 6, "Password must be at least 6 characters long.", errorEl)) valid = false;
      
      if (!validateInput(emailEl, emailEl.value.trim() !== "", "Email address is required.", errorEl)) valid = false;
      else if (!validateInput(emailEl, emailRegex.test(emailEl.value.trim()), "Please enter a valid email address.", errorEl)) valid = false;

      if (valid && passwordEl.value !== confirmPasswordEl.value) {
        validateInput(confirmPasswordEl, false, "Passwords do not match.", errorEl);
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
      if (!validateInput(emailEl, emailEl.value.trim() !== "", "Email address is required.", errorEl)) valid = false;
      else if (!validateInput(emailEl, emailRegex.test(emailEl.value.trim()), "Please enter a valid email address.", errorEl)) valid = false;

      if (!valid) return;

      // Switch to verify card immediately — no wait for SMTP
      showCard("reset-verify");

      // Fire OTP email in the background
      sendOtp(emailEl.value.trim()).then(() => {
        showToast("OTP code sent to your email address.", "success");
      }).catch((err) => {
        showToast(err.message || "Failed to send OTP. Please try again.", "error");
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
      const confirmPasswordEl = document.getElementById("reset-confirm-password");
      const errorEl = document.getElementById("reset-verify-error");

      errorEl.textContent = "";
      errorEl.style.display = "none";

      let valid = true;
      if (!validateInput(confirmPasswordEl, confirmPasswordEl.value !== "", "Confirm New Password is required.", errorEl)) valid = false;
      if (!validateInput(newPasswordEl, newPasswordEl.value !== "", "New Password is required.", errorEl)) valid = false;
      else if (!validateInput(newPasswordEl, newPasswordEl.value.length >= 6, "Password must be at least 6 characters long.", errorEl)) valid = false;
      
      if (!validateInput(otpEl, otpEl.value.trim() !== "", "OTP is required.", errorEl)) valid = false;
      else if (!validateInput(otpEl, /^\d{6}$/.test(otpEl.value.trim()), "OTP must be a 6-digit number.", errorEl)) valid = false;

      if (valid && newPasswordEl.value !== confirmPasswordEl.value) {
        validateInput(confirmPasswordEl, false, "Passwords do not match.", errorEl);
        valid = false;
      }

      if (!valid) return;

      try {
        await resetPassword(resetEmailValue, otpEl.value.trim(), newPasswordEl.value);
        showCard("reset-success");
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.style.display = "block";
      }
    });

  // Listen for state changes to update the map header/nav state
  onAuthStateChange((state) => {
    if (state.loggedIn) {
      btnMapAuth.innerHTML = '<i data-lucide="log-out"></i>';
      btnMapAuth.title = `Sign Out (Logged in as ${state.user.email})`;
      btnMapAuth.classList.add("logged-in");
    } else {
      btnMapAuth.innerHTML = '<i data-lucide="user"></i>';
      btnMapAuth.title = "Sign In";
      btnMapAuth.classList.remove("logged-in");
    }

    if (typeof lucide !== "undefined") {
      lucide.createIcons();
    }
  });
}

export function openModal(mode = "login") {
  if (!modal) return;
  modal.classList.remove("hidden");
  showCard(mode);
}

export function closeModal() {
  if (!modal) return;
  modal.classList.add("hidden");
  
  // Clear forms
  document.getElementById("form-login").reset();
  document.getElementById("form-register").reset();
  document.getElementById("form-reset-request").reset();
  document.getElementById("form-reset-verify").reset();

  clearValidationErrors();
}

function showCard(mode) {
  if (!modal) return;
  cardLogin.classList.add("hidden");
  cardRegister.classList.add("hidden");
  cardResetRequest.classList.add("hidden");
  cardResetVerify.classList.add("hidden");
  cardResetSuccess.classList.add("hidden");
  cardConfirmLogout.classList.add("hidden");

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
  } else if (mode === "confirm-logout") {
    cardConfirmLogout.classList.remove("hidden");
  }
  
  clearValidationErrors();
  
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }
}
