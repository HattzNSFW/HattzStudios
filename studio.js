(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const profileId = ["perfil-1", "perfil-2"].includes(params.get("profile")) ? params.get("profile") : "perfil-1";
  const storageKey = window.HATTZ_CORE?.profileStorageKey?.(profileId) || `meuPerfil:${profileId}`;
  const API = String(window.HATTZ_CORE?.apiBase?.() || window.HATTZ_SHARE_CONFIG?.apiBase || "").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const defaults = { glass: { opacity: 72, blur: 18, reflection: 42, glow: 28, border: 45, depth: 42 }, cards: {}, avatar: { size: 150, thickness: 2, offsetX: 0, offsetY: 0, lighting: 65, frameScale: 100, frameX: 0, frameY: 0 } };
  let profile;
  let toastTimer = 0;
  let previewFrame = 0;
  let previewStatusTimer = 0;
  try { profile = JSON.parse(localStorage.getItem(storageKey) || (profileId === "perfil-1" ? localStorage.getItem("meuPerfil") : "null") || "null") || {}; }
  catch { profile = {}; }
  profile.studio = window.HATTZ_PROFILE_CONTRACT?.normalizeStudio(profile.studio) || structuredClone(defaults);
  $("activeProfileLabel").textContent = profileId === "perfil-1" ? "Perfil 1" : "Perfil 2";
  $("backToProfile").href = `./index.html?profile=${profileId}`;
  $("profilePreview").src = `./index.html?profile=${profileId}&studioPreview=${Date.now()}`;

  const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const parseAsset = (value) => { try { return JSON.parse(value || "{}") || {}; } catch { return {}; } };
  const statusLabels = { idle: "Pronto", online: "Sincronizado", offline: "Sem conexão", syncing: "Sincronizando…", degraded: "Serviço instável", error: "Falha" };

  function setupStatus() {
    const element = $("studioConnectionStatus");
    window.HATTZ_CORE?.subscribeConnection?.((state) => {
      if (!element) return;
      element.dataset.state = state.state;
      element.textContent = statusLabels[state.state] || statusLabels.idle;
      element.title = state.detail || element.textContent;
      element.hidden = state.state === "idle";
    });
  }
  function toast(message) {
    const el = $("studioToast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function renderGlass() {
    for (const [key, value] of Object.entries(profile.studio.glass)) {
      const input = document.querySelector(`[data-glass="${key}"]`);
      if (input) input.value = value;
      const out = $(`${key}Out`);
      if (out) out.textContent = key === "blur" ? `${value} px` : `${value}%`;
    }
  }
  function renderAvatar() {
    for (const [key, value] of Object.entries(profile.studio.avatar)) {
      const input = document.querySelector(`[data-avatar="${key}"]`);
      if (input) input.value = value;
      const out = $(`avatar${key[0].toUpperCase() + key.slice(1)}Out`);
      if (out) out.textContent = ["size", "thickness", "offsetX", "offsetY", "frameX", "frameY"].includes(key) ? `${value} px` : `${value}%`;
    }
  }
  function renderCard() {
    const key = $("cardTarget").value, item = profile.studio.cards[key] || {};
    for (const [prop, id] of [["opacity", "cardOpacity"], ["blur", "cardBlur"], ["glow", "cardGlow"]]) {
      const input = $(id), out = $(id + "Out");
      input.value = item[prop] ?? profile.studio.glass[prop];
      out.textContent = item[prop] === undefined ? "Global" : `${item[prop]}${prop === "blur" ? " px" : "%"}`;
    }
  }
  function applyPreview() {
    $("previewState").textContent = "Atualizando…";
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      const frame = $("profilePreview");
      try { frame.contentWindow?.postMessage({ type: "HATTZ_STUDIO_PREVIEW_REFRESH" }, location.origin); }
      catch { frame.contentWindow?.location.reload(); }
      clearTimeout(previewStatusTimer);
      previewStatusTimer = setTimeout(() => { $("previewState").textContent = "Atualizado"; }, 180);
    });
  }
  function save(show = true) {
    if (window.HATTZ_CORE?.setProfile) window.HATTZ_CORE.setProfile(profileId, profile);
    else localStorage.setItem(storageKey, JSON.stringify(profile));
    applyPreview();
    if (show) toast("Personalização salva neste perfil.");
  }

  document.querySelectorAll(".studio-nav").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".studio-nav").forEach(x => x.classList.toggle("active", x === btn));
    document.querySelectorAll(".studio-panel").forEach(x => x.classList.toggle("active", x.id === `panel-${btn.dataset.panel}`));
  }));
  document.querySelectorAll("[data-glass]").forEach(input => input.addEventListener("input", () => {
    profile.studio.glass[input.dataset.glass] = Number(input.value);
    renderGlass(); save(false);
  }));
  document.querySelectorAll("[data-avatar]").forEach(input => input.addEventListener("input", () => {
    profile.studio.avatar[input.dataset.avatar] = Number(input.value);
    renderAvatar(); save(false);
  }));
  $("cardTarget").addEventListener("change", renderCard);
  [["cardOpacity", "opacity"], ["cardBlur", "blur"], ["cardGlow", "glow"]].forEach(([id, key]) => $(id).addEventListener("input", () => {
    const target = $("cardTarget").value;
    profile.studio.cards[target] = { ...(profile.studio.cards[target] || {}), [key]: Number($(id).value) };
    renderCard(); save(false);
  }));
  $("resetCard").addEventListener("click", () => { delete profile.studio.cards[$("cardTarget").value]; renderCard(); save(false); });
  document.querySelectorAll("[data-frame]").forEach(btn => btn.addEventListener("click", () => {
    if (btn.disabled) {
      toast(btn.title || "Esta moldura ainda não está disponível para este perfil.");
      return;
    }
    profile.moldura = btn.dataset.frame;
    if (btn.dataset.frame === "amethyst") profile.raridadeMoldura = "elite";
    document.querySelectorAll("[data-frame]").forEach(x => x.classList.toggle("selected", x === btn));
    save(false);
  }));
  $("profilePreview").addEventListener("load", () => {
    try { $("profilePreview").contentWindow.postMessage({ type: "HATTZ_STUDIO_PREVIEW_REFRESH" }, location.origin); } catch {}
  });
  $("saveStudio").addEventListener("click", () => save(true));

  let themeAllowed = false;
  let profileCode = "";
  async function loadThemeAccess() {
    profileCode = window.HATTZ_CORE?.publicCodeKey?.(profileId)
      ? localStorage.getItem(window.HATTZ_CORE.publicCodeKey(profileId)) || ""
      : localStorage.getItem(`hattz-share-code:${profileId}`) || "";
    const normalized = window.HATTZ_CORE?.normalizeCode?.(profileCode) || profileCode.replace(/[^A-Z0-9]/gi, "").replace(/^HTZ/i, "").toUpperCase();
    const nav = $("themeNav"), panel = $("panel-theme");
    if (!API || !normalized) { nav.hidden = true; panel.hidden = true; return; }
    try {
      window.HATTZ_CORE?.setConnectionState?.("syncing", "Permissões do Studio");
      const response = await fetch(`${API}/api/profiles/${normalized}/entitlements`, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível verificar os cargos deste perfil.");
      const info = await response.json();
      themeAllowed = info.studioThemeAllowed === true;
      nav.hidden = !themeAllowed; panel.hidden = !themeAllowed;
      window.HATTZ_REMOTE_BENEFITS = info.benefits || {};
      window.HATTZ_REMOTE_COLLECTIONS = info.collections || [];
      if (themeAllowed) {
        const theme = info.profileTheme || {};
        document.querySelectorAll("[data-theme]").forEach(input => { input.value = theme[input.dataset.theme] || input.value; });
        $("themeAccessNote").textContent = "Acesso liberado pelo cargo. As alterações serão salvas apenas neste perfil.";
      }
      window.HATTZ_CORE?.setConnectionState?.("online");
    } catch (error) {
      nav.hidden = true; panel.hidden = true;
      $("themeAccessNote").textContent = error.message;
      window.HATTZ_CORE?.setConnectionState?.("offline", error.message);
    }
  }
  async function saveProfileTheme() {
    if (!themeAllowed || !profileCode) { toast("Este perfil não possui acesso ao editor de tema."); return; }
    const ownerToken = localStorage.getItem(window.HATTZ_CORE?.ownerTokenKey?.(profileId) || `hattz-share-owner:${profileId}`) || "";
    if (!ownerToken) { toast("Chave privada do perfil não encontrada. Abra o perfil e sincronize-o primeiro."); return; }
    const theme = Object.fromEntries([...document.querySelectorAll("[data-theme]")].map(input => [input.dataset.theme, input.value]));
    try {
      const normalized = profileCode.replace(/[^A-Z0-9]/gi, "").replace(/^HTZ/i, "").toUpperCase();
      const response = await fetch(`${API}/api/profiles/${normalized}/studio-theme`, { method: "PUT", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ownerToken}` }, body: JSON.stringify({ theme }), cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Falha HTTP ${response.status}`);
      toast("Tema exclusivo salvo no perfil.");
      applyPreview();
    } catch (error) { toast(error.message); }
  }
  $("saveProfileTheme").addEventListener("click", saveProfileTheme);
  document.querySelectorAll("[data-theme]").forEach(input => input.addEventListener("input", () => {
    const theme = Object.fromEntries([...document.querySelectorAll("[data-theme]")].map(x => [x.dataset.theme, x.value]));
    try { $("profilePreview").contentWindow?.postMessage({ type: "HATTZ_STUDIO_THEME_PREVIEW", theme }, location.origin); } catch {}
  }));

  function effectLabel(key, value) {
    const labels = {
      profileStorageLimitBytes: "Espaço de mídia",
      badgeSlots: "Espaços de insígnia",
      themeSkin: "Tema exclusivo",
      title: "Título",
      prioritySupport: "Suporte prioritário"
    };
    let shown = value;
    if (key === "profileStorageLimitBytes" && typeof value === "number") shown = `${Math.round(value / 1048576)} MB`;
    return `${labels[key] || key}: ${String(shown)}`;
  }
  function renderCollections(catalogCollections = [], info = {}) {
    const root = $("collectionCatalog");
    if (!root) return;
    const completed = new Set((info.collections || window.HATTZ_REMOTE_COLLECTIONS || []).map(item => item.id));
    const ownedBadges = new Set((info.badges || []).map(item => item.id));
    if (!catalogCollections.length) { root.innerHTML = '<p class="muted">Nenhuma coleção publicada.</p>'; return; }
    root.innerHTML = catalogCollections.map(collection => {
      const badges = Array.isArray(collection.badges) ? collection.badges : [];
      const done = completed.has(collection.id) || (badges.length > 0 && badges.every(id => ownedBadges.has(id)));
      const progress = badges.length ? `${badges.filter(id => ownedBadges.has(id)).length}/${badges.length} insígnias` : "Coleção especial";
      const reward = Object.entries(collection.reward || {}).map(([key, value]) => effectLabel(key, value)).join(" · ");
      return `<article class="collection-card ${done ? "" : "locked"}"><h3>${escapeText(collection.name || collection.id)}</h3><p>${escapeText(collection.description || "Conjunto colecionável do Hättz.")}</p><small class="reward">${escapeText(done ? "CONCLUÍDA" : progress)}</small>${reward ? `<p class="muted">${escapeText(reward)}</p>` : ""}</article>`;
    }).join("");
  }
  function renderBenefits(catalogBenefits = [], active = {}) {
    const root = $("benefitCatalog");
    if (!root) return;
    const activeEntries = Object.entries(active || {});
    const summary = activeEntries.length
      ? `<article class="catalog-item"><strong>Benefícios herdados</strong><small>${escapeText(activeEntries.map(([key, value]) => effectLabel(key, value)).join(" · "))}</small></article>`
      : '<article class="catalog-item"><strong>Benefícios herdados</strong><small>Nenhum benefício ativo neste perfil.</small></article>';
    root.innerHTML = summary + (catalogBenefits.length ? catalogBenefits.map(benefit => {
      const isActive = Object.keys(benefit.effect || {}).some(key => key in (active || {}));
      const effects = Object.entries(benefit.effect || {}).map(([key, value]) => effectLabel(key, value)).join(" · ");
      return `<article class="catalog-item ${isActive ? "" : "locked"}"><strong>${escapeText(benefit.name || benefit.id)}</strong><small>${isActive ? "ATIVO" : "DISPONÍVEL"}</small><p class="muted">${escapeText(benefit.description || effects)}</p></article>`;
    }).join("") : '<p class="muted">Nenhum benefício publicado no catálogo.</p>');
  }
  function applyFramePermissions(catalogFrames = [], info = {}) {
    const owned = new Set((info.frames || []).map(frame => frame.id));
    const byId = new Map(catalogFrames.map(frame => [frame.id, frame]));
    for (const button of document.querySelectorAll("[data-frame]")) {
      const id = button.dataset.frame;
      const frame = byId.get(id);
      if (!frame || id === "none") continue;
      const asset = parseAsset(frame.asset_json);
      const restricted = Boolean(asset.imageData) || ["vip", "role"].includes(asset.accessMode) || ["premium", "elite"].includes(String(frame.rarity || "").toLowerCase());
      if (restricted && !owned.has(id)) {
        button.disabled = true;
        button.title = asset.accessMode === "vip" ? "Moldura VIP: concedida pelo Control Owner." : asset.accessMode === "role" ? "Moldura de cargo: exige cargo ativo e concessão." : "Moldura premium: concessão administrativa necessária.";
      } else {
        button.disabled = false;
        button.title = frame.description || frame.name || "";
      }
    }
    const grid = document.querySelector(".frame-grid");
    if (!grid) return;
    for (const frame of catalogFrames) {
      if (!frame.asset_json || document.querySelector(`[data-frame="${CSS.escape(frame.id)}"]`)) continue;
      const asset = parseAsset(frame.asset_json);
      if (!asset.imageData && asset.accessMode !== "public") continue;
      if (asset.imageData && !owned.has(frame.id)) continue;
      const button = document.createElement("button");
      button.className = "frame-option";
      button.dataset.frame = frame.id;
      button.innerHTML = `<span class="frame-preview">PNG</span><b>${escapeText(frame.name)}</b><small>${escapeText(frame.rarityLabel || "Exclusiva")}</small>`;
      button.addEventListener("click", () => {
        profile.moldura = frame.id;
        document.querySelectorAll("[data-frame]").forEach(x => x.classList.toggle("selected", x === button));
        save(false);
      });
      grid.append(button);
    }
    document.querySelectorAll("[data-frame]").forEach(button => button.classList.toggle("selected", button.dataset.frame === (profile.moldura || "none")));
  }

  async function loadCatalog() {
    const root = $("badgeCatalog");
    if (!API) {
      root.innerHTML = '<p class="muted">API não configurada. O catálogo remoto não pode ser consultado.</p>';
      return;
    }
    try {
      window.HATTZ_CORE?.setConnectionState?.("syncing", "Catálogo Hättz");
      const response = await fetch(`${API}/api/catalog`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const publicCode = localStorage.getItem(window.HATTZ_CORE?.publicCodeKey?.(profileId) || `hattz-share-code:${profileId}`) || "";
      const normalized = window.HATTZ_CORE?.normalizeCode?.(publicCode);
      let info = { badges: [], frames: [], benefits: {}, collections: [] };
      if (normalized) {
        try {
          const entitlements = await fetch(`${API}/api/profiles/${normalized}/entitlements`, { cache: "no-store" });
          if (entitlements.ok) info = await entitlements.json();
        } catch {}
      }
      window.HATTZ_REMOTE_BENEFITS = info.benefits || {};
      window.HATTZ_REMOTE_COLLECTIONS = info.collections || [];
      applyFramePermissions(data.frames || [], info);
      const earned = new Map((info.badges || []).map(item => [item.id, item]));
      root.innerHTML = (data.badges || []).map(b => {
        const award = earned.get(b.id);
        const date = award?.awarded_at ? new Date(award.awarded_at).toLocaleDateString("pt-BR") : "";
        const icon = `<span class="hattz-badge-emoji-inline">${escapeText(window.HattzEmoji?.badge?.(b) || "✦")}</span>`;
        const state = award ? " · CONQUISTADA" : b.award_mode === "automatic" ? " · REQUISITOS PENDENTES" : " · CONCESSÃO MANUAL";
        return `<div class="catalog-item" style="--badge-color:${escapeText(b.color || "#B8BCC8")};border-color:${escapeText(b.color || "#B8BCC8")}55"><strong>${icon} ${escapeText(b.name)}</strong><small>${escapeText(b.rarityLabel || b.rarity)} · ${escapeText(b.category)}${state}</small><p class="muted">${escapeText(b.description)}</p>${award ? `<small>Obtida em ${date || "data indisponível"}</small>` : ""}</div>`;
      }).join("") || '<p class="muted">Nenhuma insígnia publicada.</p>';
      renderCollections(data.collections || [], info);
      renderBenefits(data.benefits || [], info.benefits || {});
      window.HATTZ_CORE?.setConnectionState?.("online");
    } catch (error) {
      root.textContent = `Não foi possível carregar o catálogo: ${error.message}`;
      window.HATTZ_CORE?.setConnectionState?.("offline", error.message);
      window.HATTZ_CORE?.reportError?.(error, "studio:catalog");
    }
  }

  $("reloadCatalog").addEventListener("click", loadCatalog);
  $("reloadCollections").addEventListener("click", loadCatalog);
  setupStatus();
  renderGlass(); renderAvatar(); renderCard();
  loadCatalog();
  loadThemeAccess();
})();
