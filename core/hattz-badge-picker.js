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

  async function requestJson(path, options = {}) {
    const api = apiBase();
    if (!api) throw new Error("API do Hättz não configurada.");
    const response = await fetch(`${api}${path}`, { cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
    return data;
  }

  async function load(profileId = "perfil-1") {
    const code = normalizeCode(tryGet(codeKey(profileId)) || "");
    if (!code) return { available: false, code: "", token: "", badges: [], selected: [] };
    const [catalog, info] = await Promise.all([
      requestJson("/api/catalog"),
      requestJson(`/api/profiles/${encodeURIComponent(code)}/entitlements`)
    ]);
    const badges = (Array.isArray(catalog.badges) ? catalog.badges : [])
      .filter(isFree)
      .sort((a, b) => Number(b.rarity_level || b.rarityLevel || 1) - Number(a.rarity_level || a.rarityLevel || 1) ||
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

  function render(host, state, options = {}) {
    if (!host) return { getSelected: () => [], setBusy() {} };
    host.replaceChildren();
    const selected = new Set(state.selected || []);
    const badges = Array.isArray(state.badges) ? state.badges : [];

    const intro = document.createElement("p");
    intro.className = "hattz-badge-picker-intro";
    intro.textContent = badges.length
      ? `Escolha até ${MAX} insígnias livres. As demais continuam sendo concedidas pelo sistema ou pelo Control.`
      : "Nenhuma insígnia livre foi publicada no catálogo ainda.";
    host.append(intro);

    const grid = document.createElement("div");
    grid.className = "hattz-badge-choice-grid";
    for (const badge of badges) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hattz-badge-choice";
      button.dataset.badge = String(badge.id || "");
      button.setAttribute("aria-pressed", String(selected.has(badge.id)));
      button.classList.toggle("selected", selected.has(badge.id));
      const color = /^#[0-9a-f]{6}$/i.test(String(badge.color || "")) ? badge.color : "#B8BCC8";
      button.style.setProperty("--badge-accent", color);

      const glyph = document.createElement("span");
      glyph.className = "hattz-badge-choice-glyph";
      glyph.setAttribute("aria-hidden", "true");
      glyph.textContent = String(window.HattzEmoji?.badge?.(badge) || badge.icon || "✦");

      const copy = document.createElement("span");
      copy.className = "hattz-badge-choice-copy";
      const name = document.createElement("strong");
      name.textContent = String(badge.name || badge.id);
      const meta = document.createElement("small");
      meta.textContent = `${badge.rarityLabel || "Comum"} · livre`;
      copy.append(name, meta);

      const check = document.createElement("span");
      check.className = "hattz-badge-choice-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";

      button.append(glyph, copy, check);
      grid.append(button);
    }
    host.append(grid);

    const footer = document.createElement("div");
    footer.className = "hattz-badge-picker-footer";
    const status = document.createElement("p");
    status.className = "hattz-badge-picker-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "primary-button";
    saveButton.textContent = options.saveLabel || "Salvar insígnias";
    footer.append(status, saveButton);
    host.append(footer);

    const updateStatus = (message) => {
      status.textContent = message || `${selected.size} de ${MAX} insígnias escolhidas.`;
    };
    updateStatus();

    grid.addEventListener("click", (event) => {
      const button = event.target.closest(".hattz-badge-choice");
      if (!button || saveButton.disabled) return;
      const id = button.dataset.badge;
      if (!id) return;
      if (selected.has(id)) selected.delete(id);
      else if (selected.size >= MAX) {
        updateStatus(`Você já escolheu ${MAX} insígnias. Remova uma para adicionar outra.`);
        return;
      } else selected.add(id);
      button.classList.toggle("selected", selected.has(id));
      button.setAttribute("aria-pressed", String(selected.has(id)));
      updateStatus();
    });

    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      updateStatus("Salvando insígnias...");
      try {
        const result = await save(profileIdFromOptions(options), [...selected]);
        updateStatus("Insígnias atualizadas.");
        options.onSaved?.(result, [...selected]);
      } catch (error) {
        updateStatus(error.message || "Não foi possível salvar as insígnias.");
      } finally {
        saveButton.disabled = false;
      }
    });

    return {
      getSelected: () => [...selected],
      setBusy(value) { saveButton.disabled = Boolean(value); },
      setStatus: updateStatus
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
    save,
    isOnboarded,
    markOnboarded,
    onboardedKey
  });
})();
