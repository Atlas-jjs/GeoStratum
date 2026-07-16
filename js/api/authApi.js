const API_BASE = "server/auth.php";

async function handleResponse(res) {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = errorData.error || res.statusText || "Request failed";
    throw new Error(message);
  }
  return res.json();
}

/**
 * Check if the user has an active session on the backend.
 */
export function checkStatus() {
  return fetch(`${API_BASE}?action=status`).then(handleResponse);
}

/**
 * Log in a user.
 */
export function login(email, password) {
  return fetch(`${API_BASE}?action=login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(handleResponse);
}

/**
 * Register a new user.
 */
export function register(email, password) {
  return fetch(`${API_BASE}?action=register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
    }),
  }).then(handleResponse);
}

/**
 * Log out the current session.
 */
export function logout() {
  return fetch(`${API_BASE}?action=logout`, {
    method: "POST",
  }).then(handleResponse);
}

/**
 * Send an OTP code to a given username or email identity.
 */
export function sendOtp(email) {
  return fetch(`${API_BASE}?action=send_otp&email=${encodeURIComponent(email)}`)
    .then(handleResponse);
}

/**
 * Reset password via username/email, OTP, and a new password.
 */
export function resetPassword(email, otp, newPassword) {
  return fetch(`${API_BASE}?action=reset_password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      otp,
      new_password: newPassword,
    }),
  }).then(handleResponse);
}
