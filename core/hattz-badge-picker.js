/* Hättz — seletor de insígnias livres (públicas, escolhidas pelo dono do perfil). */
(() => {
  "use strict";

  const MAX = 6;
  const apiBase = () => String(
    window.HATTZ_CORE?.apiBase?.() || window.HATTZ_SHARE_CONFIG?.apiBase || ""
  ).replace(/\/+$/, "");
  const codeKey = (id) => window.HATTZ_CORE?.publicCodeKey?.(id) || `hattz-share-code:${id}`;
  const tokenKey = (id) => window.HATTZ_CORE?.ownerTokenKey?.(id) || `hattz-share-owner:${id}`;
  const onboardedKey = (id) => `hattz2:badge-onboarding:${id}`;
  const normalizeCode = (value) => window.HATTZ_CORE?.normalizeCode?.(value) ||
    String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^HTZ/, "");
  const isFree = (badge) => Number(badge?.is_free) === 1 || badge?.isFree === 1 || badge?.isFree === true;
  const rarityLevel = (badge) => Number(badge?.rarity_level || badge?.rarityLevel || 1);
  const rarityLabel = (badge) => String(badge?.rarityLabel || badge?.rarity || "Comum");
  const categoryOf = (badge) => String(badge?.category || "Outros");
  const accentOf = (badge) => /^#[0-9a-f]{6}$/i.test(String(badge?.color || "")) ? badge.color : "#B8BCC8";
  const glyphOf = (badge) => String(window.HattzEmoji?.badge?.(badge) || badge?.icon || "✦");

  async function requestJson(path, options = {}) {
    const api = apiBase();
    if (!api) throw new Error("API do Hättz não configurada.");
    const response = await fetch(`${api}${path}`, { cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
    return data;
  }

  async function load(profileId = "perfil-1", options = {}) {
    const code = normalizeCode(tryGet(codeKey(profileId)) || "");
    if (!code) return { available: false, code: "", token: "", badges: [], selected: [] };
    const supplied = options.catalog && Array.isArray(options.catalog.badges) ? options.catalog : null;
    const [catalog, info] = await Promise.all([
      supplied ? Promise.resolve(supplied) : requestJson("/api/catalog"),
      requestJson(`/api/profiles/${encodeURIComponent(code)}/entitlements`)
    ]);
    const badges = (Array.isArray(catalog.badges) ? catalog.badges : [])
      .filter(isFree)
      .sort((a, b) => rarityLevel(b) - rarityLevel(a) ||
        String(a.name || a.id).localeCompare(String(b.name || b.id), "pt-BR"));
    const fromInfo = Array.isArray(info.selfBadgeIds)
      ? info.selfBadgeIds
      : (Array.isArray(info.badges) ? info.badges.filter((badge) => badge.awardedBy === "self").map((badge) => badge.id) : []);
    return {
      available: true,
      code,
      token: tryGet(tokenKey(profileId)) || "",
      badges,
      selected: Array.isArray(fromInfo) ? fromInfo.filter((id) => badges.some((badge) => badge.id === id)) : []
    };
  }

  function renderLoading(host, label = "Carregando insígnias disponíveis...") {
    if (!host) return;
    host.replaceChildren();
    const note = document.createElement("p");
    note.className = "hattz-badge-picker-intro";
    note.textContent = label;
    const skeleton = document.createElement("div");
    skeleton.className = "hattz-badge-picker-skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 6; index++) {
      const card = document.createElement("span");
      card.className = "hattz-badge-skeleton-card";
      skeleton.append(card);
    }
    host.append(note, skeleton);
  }

  function render(host, state, options = {}) {
    if (!host) return { getSelected: () => [], setBusy() {}, setStatus() {} };
    host.replaceChildren();
    // A ordem do array é a ordem que será salva e exibida no perfil.
    const selected = [...new Set(Array.isArray(state.selected) ? state.selected.filter(Boolean) : [])].slice(0, MAX);
    const badges = Array.isArray(state.badges) ? state.badges : [];
    const badgeById = new Map(badges.map((badge) => [String(badge.id), badge]));
    const filters = { query: "", rarity: "", category: "" };

    const intro = document.createElement("p");
    intro.className = "hattz-badge-picker-intro";
    intro.textContent = badges.length
      ? `Escolha até ${MAX} insígnias livres. Use a busca e os filtros para encontrar uma insígnia; a ordem escolhida aparece no perfil.`
      : "Nenhuma insígnia livre foi publicada no catálogo ainda.";
    host.append(intro);

    const toolbar = document.createElement("div");
    toolbar.className = "hattz-badge-picker-toolbar";
    const search = document.createElement("input");
    search.type = "search";
    search.className = "hattz-badge-search";
    search.placeholder = "Buscar insígnia";
    search.setAttribute("aria-label", "Buscar insígnia livre");
    const rarity = document.createElement("select");
    rarity.className = "hattz-badge-filter";
    rarity.setAttribute("aria-label", "Filtrar insígnias por raridade");
    const categories = [...new Set(badges.map(categoryOf))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const rarities = [...new Map(badges.map((badge) => [rarityLabel(badge), rarityLevel(badge)])).entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
    rarity.append(option("", "Todas as raridades"));
    for (const [label] of rarities) rarity.append(option(label, label));
    const category = document.createElement("select");
    category.className = "hattz-badge-filter";
    category.setAttribute("aria-label", "Filtrar insígnias por categoria");
    category.append(option("", "Todas as categorias"));
    for (const label of categories) category.append(option(label, label));
    const count = document.createElement("span");
    count.className = "hattz-badge-filter-count";
    count.setAttribute("role", "status");
    count.setAttribute("aria-live", "polite");
    toolbar.append(search, rarity, category, count);
    host.append(toolbar);

    const grid = document.createElement("div");
    grid.className = "hattz-badge-choice-grid";
    const empty = document.createElement("p");
    empty.className = "hattz-badge-picker-empty";
    empty.hidden = true;
    host.append(grid, empty);

    const order = document.createElement("div");
    order.className = "hattz-badge-order";
    const orderHeading = document.createElement("p");
    orderHeading.className = "hattz-badge-order-heading";
    orderHeading.textContent = "Ordem no perfil";
    const orderList = document.createElement("ol");
    orderList.className = "hattz-badge-order-list";
    orderList.setAttribute("aria-label", "Insígnias escolhidas, em ordem");
    order.append(orderHeading, orderList);
    host.append(order);

    const footer = document.createElement("div");
    footer.className = "hattz-badge-picker-footer";
    const summary = document.createElement("div");
    summary.className = "hattz-badge-picker-summary";
    const status = document.createElement("p");
    status.className = "hattz-badge-picker-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const slots = document.createElement("div");
    slots.className = "hattz-badge-picker-slots";
    slots.setAttribute("aria-hidden", "true");
    for (let index = 0; index < MAX; index++) {
      const slot = document.createElement("span");
      slot.className = "hattz-badge-picker-slot";
      slots.append(slot);
    }
    const preview = document.createElement("div");
    preview.className = "hattz-badge-picker-preview";
    preview.setAttribute("aria-hidden", "true");
    summary.append(status, slots, preview);
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "primary-button";
    saveButton.textContent = options.saveLabel || "Salvar insígnias";
    footer.append(summary, saveButton);
    host.append(footer);

    function option(value, label) {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = label;
      return item;
    }

    function visibleBadges() {
      const query = filters.query.trim().toLocaleLowerCase("pt-BR");
      return badges.filter((badge) => {
        if (filters.rarity && rarityLabel(badge) !== filters.rarity) return false;
        if (filters.category && categoryOf(badge) !== filters.category) return false;
        if (!query) return true;
        return [badge.id, badge.name, categoryOf(badge), rarityLabel(badge), badge.description]
          .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query));
      });
    }

    function renderGrid() {
      grid.replaceChildren();
      const visible = visibleBadges();
      for (const badge of visible) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "hattz-badge-choice";
        button.dataset.badge = String(badge.id || "");
        const isSelected = selected.includes(String(badge.id));
        button.setAttribute("aria-pressed", String(isSelected));
        button.classList.toggle("selected", isSelected);
        button.style.setProperty("--badge-accent", accentOf(badge));

        const glyph = document.createElement("span");
        glyph.className = "hattz-badge-choice-glyph";
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = glyphOf(badge);

        const copy = document.createElement("span");
        copy.className = "hattz-badge-choice-copy";
        const name = document.createElement("strong");
        name.textContent = String(badge.name || badge.id);
        const meta = document.createElement("small");
        meta.textContent = `${rarityLabel(badge)} · ${categoryOf(badge)} · livre`;
        copy.append(name, meta);

        const check = document.createElement("span");
        check.className = "hattz-badge-choice-check";
        check.setAttribute("aria-hidden", "true");
        check.textContent = "✓";

        button.append(glyph, copy, check);
        grid.append(button);
      }
      const filtered = Boolean(filters.query || filters.rarity || filters.category);
      empty.hidden = visible.length > 0;
      empty.textContent = filtered
        ? "Nenhuma insígnia corresponde aos filtros. Ajuste a busca ou limpe os filtros."
        : "Nenhuma insígnia livre foi publicada no catálogo ainda.";
      count.textContent = filtered ? `${visible.length} de ${badges.length} insígnias` : `${badges.length} insígnias livres`;
      grid.classList.toggle("limit-reached", selected.length >= MAX);
    }

    function renderOrder() {
      orderList.replaceChildren();
      order.hidden = selected.length === 0;
      selected.forEach((id, index) => {
        const badge = badgeById.get(id) || {};
        const item = document.createElement("li");
        item.className = "hattz-badge-order-item";
        item.style.setProperty("--badge-accent", accentOf(badge));
        const glyph = document.createElement("span");
        glyph.className = "hattz-badge-order-glyph";
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = glyphOf(badge);
        const name = document.createElement("span");
        name.className = "hattz-badge-order-name";
        name.textContent = String(badge.name || id);
        const controls = document.createElement("span");
        controls.className = "hattz-badge-order-controls";
        for (const [direction, symbol, label] of [["up", "↑", "Subir"], ["down", "↓", "Descer"]]) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "hattz-badge-order-move";
          button.dataset.moveBadge = direction;
          button.dataset.badgeId = id;
          button.textContent = symbol;
          button.setAttribute("aria-label", `${label} ${name.textContent}`);
          button.disabled = direction === "up" ? index === 0 : index === selected.length - 1;
          controls.append(button);
        }
        const position = document.createElement("span");
        position.className = "hattz-badge-order-position";
        position.textContent = `${index + 1}º`;
        item.append(position, glyph, name, controls);
        orderList.append(item);
      });
    }

    const updateStatus = (message) => {
      status.textContent = message || `${selected.length} de ${MAX} insígnias escolhidas.`;
      [...slots.children].forEach((slot, index) => slot.classList.toggle("filled", index < selected.length));
      preview.replaceChildren(...selected.map((id) => {
        const badge = badgeById.get(id) || {};
        const chip = document.createElement("span");
        chip.className = "hattz-badge-preview-chip";
        chip.style.setProperty("--badge-accent", accentOf(badge));
        chip.textContent = glyphOf(badge);
        return chip;
      }));
      renderGrid();
      renderOrder();
    };

    function toggle(id) {
      if (!badgeById.has(id)) return;
      const index = selected.indexOf(id);
      if (index >= 0) selected.splice(index, 1);
      else if (selected.length >= MAX) {
        updateStatus(`Você já escolheu ${MAX} insígnias. Remova uma para adicionar outra.`);
        return;
      } else selected.push(id);
      updateStatus();
    }

    function move(id, direction) {
      const index = selected.indexOf(id);
      const target = index + (direction === "up" ? -1 : 1);
      if (index < 0 || target < 0 || target >= selected.length) return;
      [selected[index], selected[target]] = [selected[target], selected[index]];
      updateStatus(`Ordem atualizada: ${String(badgeById.get(id)?.name || id)} na posição ${target + 1}.`);
      const moved = [...orderList.querySelectorAll("[data-move-badge]")]
        .find((button) => button.dataset.badgeId === id && !button.disabled);
      moved?.focus();
    }

    search.addEventListener("input", () => { filters.query = search.value; renderGrid(); });
    rarity.addEventListener("change", () => { filters.rarity = rarity.value; renderGrid(); });
    category.addEventListener("change", () => { filters.category = category.value; renderGrid(); });

    grid.addEventListener("click", (event) => {
      const button = event.target.closest(".hattz-badge-choice");
      if (!button || saveButton.disabled) return;
      toggle(button.dataset.badge);
    });

    grid.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const cards = [...grid.querySelectorAll(".hattz-badge-choice")];
      const index = cards.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 1 : -1;
      cards[(index + delta + cards.length) % cards.length]?.focus();
    });

    orderList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-move-badge]");
      if (!button || saveButton.disabled) return;
      move(button.dataset.badgeId, button.dataset.moveBadge);
    });

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      updateStatus("Salvando insígnias...");
      try {
        const result = await save(profileIdFromOptions(options), [...selected]);
        updateStatus("Insígnias atualizadas na ordem escolhida.");
        options.onSaved?.(result, [...selected]);
      } catch (error) {
        updateStatus(error.message || "Não foi possível salvar as insígnias.");
      } finally {
        saveButton.disabled = false;
      }
    });

    updateStatus();
    renderGrid();

    return {
      getSelected: () => [...selected],
      setBusy(value) { saveButton.disabled = Boolean(value); },
      setStatus: updateStatus,
      setFilters(next = {}) {
        if (typeof next.query === "string") { search.value = next.query; filters.query = next.query; }
        if (typeof next.rarity === "string") { rarity.value = next.rarity; filters.rarity = next.rarity; }
        if (typeof next.category === "string") { category.value = next.category; filters.category = next.category; }
        renderGrid();
      }
    };
  }

  function profileIdFromOptions(options) {
    return ["perfil-1", "perfil-2"].includes(options.profileId) ? options.profileId : "perfil-1";
  }

  async function save(profileId = "perfil-1", badgeIds = []) {
    const code = normalizeCode(tryGet(codeKey(profileId)) || "");
    const token = tryGet(tokenKey(profileId)) || "";
    if (!code || !token) throw new Error("Publique o perfil para escolher insígnias.");
    return requestJson(`/api/profiles/${encodeURIComponent(code)}/badges/self`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ badgeIds: badgeIds.slice(0, MAX) })
    });
  }

  function tryGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function trySet(key, value) { try { localStorage.setItem(key, value); } catch {} }
  function isOnboarded(profileId = "perfil-1") { return tryGet(onboardedKey(profileId)) === "1"; }
  function markOnboarded(profileId = "perfil-1") { trySet(onboardedKey(profileId), "1"); }

  window.HattzBadgePicker = Object.freeze({
    limit: MAX,
    load,
    render,
    renderLoading,
    save,
    isOnboarded,
    markOnboarded,
    onboardedKey
  });
})();
