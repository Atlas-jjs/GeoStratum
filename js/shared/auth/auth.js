import { checkStatus, logout as apiLogout } from "../api/authApi.js";

const STORAGE_KEY = "geostratum_auth_state";

let authState = {
  loggedIn: false,
  user: null,
  initialized: false,
};

// Array of callback functions to run when the authentication state changes
const callbacks = new Set();

/**
 * Get the current locally cached authentication state.
 */
export function getAuthState() {
  // If not initialized in memory but stored in localStorage, bootstrap it
  if (!authState.initialized) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        authState.loggedIn = !!parsed.loggedIn;
        authState.user = parsed.user || null;
      }
    } catch (e) {
      console.error("Failed to read auth state from localStorage", e);
    }
  }
  return authState;
}

/**
 * Update the auth state, save to localStorage, and notify all registered listeners.
 */
export function updateAuthState(loggedIn, user) {
  authState.loggedIn = loggedIn;
  authState.user = user || null;
  authState.initialized = true;

  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        loggedIn: authState.loggedIn,
        user: authState.user,
        timestamp: Date.now(), // Ensure value changes to trigger storage event
      }),
    );
  } catch (e) {
    console.error("Failed to save auth state to localStorage", e);
  }

  notifyListeners();
}

/**
 * Register a listener callback to run whenever the auth state changes.
 */
export function onAuthStateChange(callback) {
  callbacks.add(callback);
  // Run initially with the current state
  callback(getAuthState());

  return () => {
    callbacks.delete(callback);
  };
}

/**
 * Notify all registered callbacks of a state change.
 */
function notifyListeners() {
  const state = getAuthState();
  callbacks.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.error("Error running auth state change listener:", e);
    }
  });
}

/**
 * Query the backend to sync and confirm current session status.
 */
export async function syncAuthStatus() {
  try {
    const data = await checkStatus();
    updateAuthState(data.loggedIn, data.user);
    return getAuthState();
  } catch (e) {
    console.error("Failed to sync session status with backend", e);
    updateAuthState(false, null);
    return getAuthState();
  }
}

/**
 * Log out and clear local and remote sessions.
 */
export async function logoutUser() {
  try {
    await apiLogout();
  } catch (e) {
    console.error("Backend logout error:", e);
  } finally {
    updateAuthState(false, null);
  }
}

// Listen to storage events to support real-time tab concurrency
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) {
    try {
      const parsed = JSON.parse(e.newValue);
      authState.loggedIn = !!parsed.loggedIn;
      authState.user = parsed.user || null;
      authState.initialized = true;
      notifyListeners();
    } catch (err) {
      console.error("Error syncing auth state from storage event", err);
    }
  }
});

// Proactively check status from backend on load
syncAuthStatus();
