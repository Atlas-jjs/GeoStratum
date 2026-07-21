/**
 * Shows a premium toast notification.
 * @param {string} message - The message content.
 * @param {string} type - 'success' | 'error' | 'info'
 */
export function showToast(message, type = "success") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type} reveal-toast`;

  const iconName = type === "success" ? "check-circle" : (type === "error" ? "alert-circle" : "info");

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span class="toast-message">${message}</span>
    <button class="toast-close-btn" title="Dismiss">&times;</button>
  `;

  container.appendChild(toast);

  // Initialize Lucide icons on the newly appended toast element
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  // Auto remove toast after 4 seconds
  const timer = setTimeout(() => {
    dismissToast(toast);
  }, 4000);

  // Manual close
  toast.querySelector(".toast-close-btn").addEventListener("click", () => {
    clearTimeout(timer);
    dismissToast(toast);
  });
}

function dismissToast(toast) {
  toast.classList.remove("reveal-toast");
  toast.classList.add("fade-out-toast");
  toast.addEventListener("animationend", () => {
    toast.remove();
  });
}
