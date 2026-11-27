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

  let lastFocused = null;
  const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

  // O menu único aponta o painel selecionado na tela (Studio) ou a página atual.
  function syncActiveMenu() {
    const activeNav = document.querySelector(".studio-nav.active[data-panel], .nav-item.active[data-view]");
    const panelId = activeNav ? (activeNav.dataset.panel || activeNav.dataset.view) : "";
    const file = (window.location.pathname || "").split("/").pop() || "index.html";
    for (const button of list.querySelectorAll("button[data-menu-panel],button[data-menu-href]")) {
      const href = button.dataset.menuHref || "";
      const page = href.startsWith("./") ? href.split("#")[0].slice(2) : "";
      const active = panelId
        ? button.dataset.menuPanel === panelId
        : Boolean(page) && page === file;
      button.dataset.active = String(active);
      if (active) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  // Só elementos realmente visíveis participam da navegação por teclado.
  function focusables() {
    return Array.from(panel.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.hidden && !element.closest("[hidden]"));
  }

  function setOpen(open) {
    if (panel.hidden !== open) return;
    if (open) {
      lastFocused = document.activeElement;
      panel.hidden = false;
      if (backdrop) backdrop.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      document.body.classList.add("hattz-menu-open");
      syncActiveMenu();
      applyFilter();
      (search && !search.hidden ? search : focusables()[0])?.focus();
    } else {
      panel.hidden = true;
      if (backdrop) backdrop.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("hattz-menu-open");
      const target = lastFocused && lastFocused.isConnected ? lastFocused : toggle;
      lastFocused = null;
      target?.focus?.();
    }
  }

  function applyFilter() {
    const needle = normalize(search?.value || "").trim();
    let visibleActions = 0;
    for (const child of list.children) {
      if (child.classList.contains("hattz-menu-group")) {
        child.dataset.visibleCount = "0";
        continue;
      }
      if (!child.matches("button[data-menu-action],button[data-menu-panel],button[data-menu-href]")) continue;
      // O Control só aparece para perfis oficiais; membros comuns não veem a entrada.
      const allowed = !child.hasAttribute("data-menu-control") || Boolean(window.HATTZ_CORE?.isOfficialProfile?.());
      const text = normalize(`${child.textContent} ${child.dataset.keywords || ""}`);
      const show = allowed && (!needle || text.includes(needle));
      child.hidden = !show;
      if (show) {
        visibleActions += 1;
        let group = child.previousElementSibling;
        while (group && !group.classList.contains("hattz-menu-group")) group = group.previousElementSibling;
        if (group) group.dataset.visibleCount = String(Number(group.dataset.visibleCount || 0) + 1);
      }
    }
    for (const group of list.querySelectorAll(".hattz-menu-group")) group.hidden = Number(group.dataset.visibleCount || 0) === 0;
    if (empty) empty.hidden = visibleActions > 0;
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  closeButton?.addEventListener("click", () => setOpen(false));
  backdrop?.addEventListener("click", () => setOpen(false));
  search?.addEventListener("input", applyFilter);
  search?.addEventListener("search", applyFilter);
  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-menu-action],button[data-menu-panel],button[data-menu-href]");
    if (!button) return;
    if (button.dataset.menuHref) {
      setOpen(false);
      window.location.href = button.dataset.menuHref;
      return;
    }
    setOpen(false);
    const detail = { action: button.dataset.menuAction || "", panel: button.dataset.menuPanel || "" };
    if (detail.action || detail.panel) document.dispatchEvent(new CustomEvent("hattz:menu", { detail }));
    syncActiveMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (panel.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      // Primeiro Esc limpa a busca; o segundo fecha o menu.
      if (search && search.value) {
        search.value = "";
        applyFilter();
        search.focus();
      } else {
        setOpen(false);
      }
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  syncActiveMenu();
  window.HATTZ_MENU = { open: () => setOpen(true), close: () => setOpen(false), syncActive: syncActiveMenu };
})();
