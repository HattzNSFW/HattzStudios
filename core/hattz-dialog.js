/* Hättz — Armadilha de foco leve para diálogos nativos do Share e do Control. */
(() => {
  "use strict";

  const DIALOG_SELECTOR = '.modal-backdrop.open, .modal-backdrop[aria-hidden="false"], [role="dialog"][aria-modal="true"]:not([hidden])';
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function activeDialogs() {
    return [...document.querySelectorAll(DIALOG_SELECTOR)].filter((node) => {
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function focusables(dialog) {
    return [...dialog.querySelectorAll(FOCUSABLE)].filter((node) => {
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function topDialog() {
    const dialogs = activeDialogs();
    return dialogs[dialogs.length - 1] || null;
  }

  function enter(dialog) {
    if (!dialog || dialog.dataset.hattzDialogActive === "1") return;
    dialog.dataset.hattzDialogActive = "1";
    dialog.dataset.hattzDialogReturn = document.activeElement?.id || "";
    const first = focusables(dialog)[0];
    if (first && !dialog.contains(document.activeElement)) first.focus();
  }

  function leave(dialog) {
    if (!dialog || dialog.dataset.hattzDialogActive !== "1") return;
    delete dialog.dataset.hattzDialogActive;
    const returnId = dialog.dataset.hattzDialogReturn;
    delete dialog.dataset.hattzDialogReturn;
    const target = returnId && document.getElementById(returnId);
    if (target && !activeDialogs().length) target.focus();
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const dialog = topDialog();
    if (!dialog) return;
    const items = focusables(dialog);
    if (!items.length) {
      event.preventDefault();
      dialog.setAttribute("tabindex", "-1");
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });

  const observer = new MutationObserver(() => {
    const active = topDialog();
    if (active) enter(active);
    for (const dialog of document.querySelectorAll("[data-hattz-dialog-active]")) {
      if (dialog !== active) leave(dialog);
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "hidden", "aria-hidden"], subtree: true });

  window.HattzDialog = Object.freeze({ active: topDialog, enter, leave });
})();
