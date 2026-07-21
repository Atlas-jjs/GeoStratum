export function confirmDelete(name) {
  return new Promise((resolve) => {
    const modal = document.getElementById("delete-confirm-modal");
    const message = document.getElementById("delete-confirm-message");
    const btnCancel = document.getElementById("btn-cancel-delete");
    const btnConfirm = document.getElementById("btn-confirm-delete");
    if (!modal || !message || !btnCancel || !btnConfirm) {
      resolve(window.confirm(`Remove "${name}"? This cannot be undone.`));
      return;
    }

    message.textContent = `Remove "${name}"? This cannot be undone.`;
    modal.classList.remove("hidden");

    const cleanup = (result) => {
      modal.classList.add("hidden");
      btnCancel.removeEventListener("click", onCancel);
      btnConfirm.removeEventListener("click", onConfirm);
      modal.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onConfirm = () => cleanup(true);
    const onBackdrop = (e) => e.target === modal && cleanup(false);
    const onKeydown = (e) => e.key === "Escape" && cleanup(false);

    btnCancel.addEventListener("click", onCancel);
    btnConfirm.addEventListener("click", onConfirm);
    modal.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

let toastTimer = null;
export function showDuplicateNameNotice(originalName, finalName) {
  const toast = document.getElementById("duplicate-name-toast");
  const message = document.getElementById("duplicate-name-toast-message");
  if (!toast || !message) return;

  message.textContent = `"${originalName}" already exists - imported as "${finalName}".`;
  toast.classList.remove("hidden");
  void toast.offsetWidth;
  toast.classList.add("is-visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.classList.add("hidden"), 200);
  }, 4000);
}
