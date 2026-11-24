(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const toggle = $("openHattzMenu");
  const panel = $("hattzMenu");
  const backdrop = $("hattzMenuBackdrop");
  const closeButton = $("closeHattzMenu");
  const search = $("hattzMenuSearch");
  const list = $("hattzMenuList");
  const empty = $("hattzMenuEmpty");
  if (!toggle || !panel || !list) return;

  function setOpen(open) {
    panel.hidden = !open;
    if (backdrop) backdrop.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("hattz-menu-open", open);
    if (open) {
      search?.focus();
      applyFilter();
    } else {
      toggle.focus();
    }
  }

  function applyFilter() {
    const needle = String(search?.value || "").trim().toLocaleLowerCase("pt-BR");
    let visibleGroups = 0;
    for (const child of list.children) {
      if (child.classList.contains("hattz-menu-group")) {
        child.dataset.visibleCount = "0";
        continue;
      }
      if (!child.matches("button[data-menu-action],button[data-menu-panel],button[data-menu-href]")) continue;
      const text = `${child.textContent} ${child.dataset.keywords || ""}`.toLocaleLowerCase("pt-BR");
      const show = !needle || text.includes(needle);
      child.hidden = !show;
      if (show) {
        visibleGroups += 1;
        let group = child.previousElementSibling;
        while (group && !group.classList.contains("hattz-menu-group")) group = group.previousElementSibling;
        if (group) group.dataset.visibleCount = String(Number(group.dataset.visibleCount || 0) + 1);
      }
    }
    for (const group of list.querySelectorAll(".hattz-menu-group")) group.hidden = Number(group.dataset.visibleCount || 0) === 0;
    if (empty) empty.hidden = visibleGroups > 0;
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  closeButton?.addEventListener("click", () => setOpen(false));
  backdrop?.addEventListener("click", () => setOpen(false));
  search?.addEventListener("input", applyFilter);
  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-menu-action],button[data-menu-panel],button[data-menu-href]");
    if (!button) return;
    if (button.dataset.menuHref) {
      window.location.href = button.dataset.menuHref;
      return;
    }
    setOpen(false);
    const detail = { action: button.dataset.menuAction || "", panel: button.dataset.menuPanel || "" };
    if (detail.action || detail.panel) document.dispatchEvent(new CustomEvent("hattz:menu", { detail }));
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });

  window.HATTZ_MENU = { open: () => setOpen(true), close: () => setOpen(false) };
})();
