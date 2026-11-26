(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const profileId = ["perfil-1", "perfil-2"].includes(params.get("profile")) ? params.get("profile") : "perfil-1";
  const storageKey = window.HATTZ_CORE?.profileStorageKey?.(profileId) || `meuPerfil:${profileId}`;
  const API = String(window.HATTZ_CORE?.apiBase?.() || window.HATTZ_SHARE_CONFIG?.apiBase || "").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const defaults = { glass: { opacity: 72, blur: 18, reflection: 42, glow: 28, border: 45, depth: 42 }, cards: {}, avatar: { size: 150, thickness: 2, offsetX: 0, offsetY: 0, lighting: 65, frameScale: 100, frameX: 0, frameY: 0, frameAutoFit: true } };
  const frameAssets = {};
  let profile;
  let toastTimer = 0;
  let previewFrame = 0;
  let previewStatusTimer = 0;
  try { profile = JSON.parse(localStorage.getItem(storageKey) || (profileId === "perfil-1" ? localStorage.getItem("meuPerfil") : "null") || "null") || {}; }
  catch { profile = {}; }
  profile.studio = window.HATTZ_PROFILE_CONTRACT?.normalizeStudio(profile.studio) || structuredClone(defaults);

  const STUDIO_HISTORY_KEY = `studio:${profileId}`;
  let applyingStudioHistory = false;
  function studioSnapshot() {
    return JSON.parse(JSON.stringify({
      studio: profile.studio,
      moldura: profile.moldura,
      raridadeMoldura: profile.raridadeMoldura
    }));
  }
  window.HATTZ_HISTORY?.push(STUDIO_HISTORY_KEY, studioSnapshot(), { label: "Studio carregado" });

  function syncHistoryButtons() {
    const history = window.HATTZ_HISTORY;
    const undo = $("studioUndo");
    const redo = $("studioRedo");
    if (undo) undo.disabled = !history?.canUndo?.(STUDIO_HISTORY_KEY);
    if (redo) redo.disabled = !history?.canRedo?.(STUDIO_HISTORY_KEY);
  }

  function undoStudio() {
    const snapshot = window.HATTZ_HISTORY?.undo(STUDIO_HISTORY_KEY);
    if (!snapshot) return false;
    applyStudioSnapshot(snapshot, "Personalização desfeita.");
    syncHistoryButtons();
    return true;
  }

  function redoStudio() {
    const snapshot = window.HATTZ_HISTORY?.redo(STUDIO_HISTORY_KEY);
    if (!snapshot) return false;
    applyStudioSnapshot(snapshot, "Personalização refeita.");
    syncHistoryButtons();
    return true;
  }

  const profileHref = `./index.html?profile=${profileId}`;
  $("activeProfileLabel").textContent = profileId === "perfil-1" ? "Perfil 1" : "Perfil 2";
  if ($("backToProfile")) $("backToProfile").href = profileHref;
  $("profilePreview").src = `./index.html?profile=${profileId}&studioPreview=${Date.now()}`;
  // Molduras só entram no catálogo pelo Control; remove qualquer PNG local antigo.
  if (profile.moldura === "moldura-custom") profile.moldura = "none";
  if (profile.customFrame) { delete profile.customFrame; window.HATTZ_CORE?.setProfile?.(profileId, profile); }
  syncFrameSelection();

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
    const autoFit = $("avatarFrameAutoFit");
    if (autoFit) autoFit.checked = profile.studio.avatar.frameAutoFit !== false;
  }
  function renderCard() {
    const key = $("cardTarget").value, item = profile.studio.cards[key] || {};
    for (const [prop, id] of [["opacity", "cardOpacity"], ["blur", "cardBlur"], ["glow", "cardGlow"]]) {
      const input = $(id), out = $(id + "Out");
      input.value = item[prop] ?? profile.studio.glass[prop];
      out.textContent = item[prop] === undefined ? "Global" : `${item[prop]}${prop === "blur" ? " px" : "%"}`;
    }
  }
  function syncFrameSelection() {
    document.querySelectorAll("[data-frame]").forEach(button => {
      button.classList.toggle("selected", button.dataset.frame === (profile.moldura || "none"));
    });
  }
  function applyPreview() {
    $("previewState").textContent = "Atualizando…";
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      const frame = $("profilePreview");
      try { frame.contentWindow?.postMessage({ type: "HATTZ_STUDIO_PREVIEW_REFRESH", frames: frameAssets }, location.origin); }
      catch { frame.contentWindow?.location.reload(); }
      clearTimeout(previewStatusTimer);
      previewStatusTimer = setTimeout(() => { $("previewState").textContent = "Atualizado"; }, 180);
    });
  }
  function writeProfile(show = false) {
    if (window.HATTZ_CORE?.setProfile) window.HATTZ_CORE.setProfile(profileId, profile);
    else localStorage.setItem(storageKey, JSON.stringify(profile));
    window.HATTZ_SUITE?.backup?.(profileId, profile);
    applyPreview();
    syncHistoryButtons();
    if (show) toast("Personalização salva neste perfil.");
  }

  function save(show = true) {
    if (!applyingStudioHistory) {
      window.HATTZ_HISTORY?.push(STUDIO_HISTORY_KEY, studioSnapshot(), { coalesceMs: 500, label: "Studio alterado" });
    }
    writeProfile(show);
  }

  function applyStudioSnapshot(snapshot, message) {
    applyingStudioHistory = true;
    try {
      profile.studio = window.HATTZ_PROFILE_CONTRACT?.normalizeStudio?.(snapshot.studio) || snapshot.studio;
      profile.moldura = snapshot.moldura || "none";
      profile.raridadeMoldura = snapshot.raridadeMoldura || "none";
      if (profile.moldura === "moldura-custom") profile.moldura = "none";
      delete profile.customFrame;
      renderGlass();
      renderAvatar();
      renderCard();
      syncFrameSelection();
      writeProfile(false);
      if (message) toast(message);
    } finally {
      applyingStudioHistory = false;
    }
  }

  window.addEventListener("hattz:restore-studio", (event) => {
    if (!event.detail?.studio) return;
    applyStudioSnapshot(event.detail, "Studio restaurado neste navegador.");
  });

  window.HATTZ_HISTORY?.bindShortcut({
    priority: 5,
    isActive: () => !window.HattzLiquidGlass?.isOpen?.(),
    onUndo: undoStudio,
    onRedo: redoStudio
  });

  $("studioUndo")?.addEventListener("click", undoStudio);
  $("studioRedo")?.addEventListener("click", redoStudio);
  syncHistoryButtons();

  document.querySelectorAll(".studio-nav[data-panel]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".studio-nav").forEach(x => x.classList.toggle("active", x === btn));
    document.querySelectorAll(".studio-panel").forEach(x => x.classList.toggle("active", x.id === `panel-${btn.dataset.panel}`));
  }));
  // Link direto do menu do Share: abre a aba de molduras no Studio.
  if (location.hash === "#frames") document.querySelector('.studio-nav[data-panel="frames"]')?.click();
  document.getElementById("openThemeCustomizer")?.addEventListener("click", () => {
    if (window.HattzLiquidGlass?.isOpen?.()) window.HattzLiquidGlass.close();
    else window.HattzLiquidGlass?.open?.();
  });
  document.querySelectorAll("[data-glass]").forEach(input => input.addEventListener("input", () => {
    profile.studio.glass[input.dataset.glass] = Number(input.value);
    renderGlass(); save(false);
  }));
  document.querySelectorAll("[data-avatar]").forEach(input => input.addEventListener("input", () => {
    profile.studio.avatar[input.dataset.avatar] = Number(input.value);
    renderAvatar(); save(false);
  }));
  $("avatarFrameAutoFit")?.addEventListener("change", (event) => {
    profile.studio.avatar.frameAutoFit = event.target.checked;
    save(false);
  });
  $("fitFrameNow")?.addEventListener("click", () => {
    const asset = frameAssets[profile.moldura] || {};
    if (!asset.imageData) { toast("Escolha uma moldura PNG para ajustar."); return; }
    const finish = (info) => {
      const fit = window.HATTZ_FRAME_FIT;
      const adjust = fit?.autoFrameAdjust(info, Number(profile.studio.avatar.size) || 150, profile.studio.avatar);
      if (!adjust) { toast("Não foi possível medir esta moldura."); return; }
      Object.assign(profile.studio.avatar, {
        frameScale: adjust.scale, frameX: adjust.x, frameY: adjust.y, frameAutoFit: true
      });
      renderAvatar();
      save(false);
      toast(`Moldura ajustada: ${adjust.scale}% · ${adjust.x}px / ${adjust.y}px.`);
    };
    const image = new Image();
    image.onload = () => finish(window.HATTZ_FRAME_FIT?.measureFrameImage(image));
    image.onerror = () => finish(null);
    image.src = asset.imageData;
  });
  $("cardTarget").addEventListener("change", renderCard);
  [["cardOpacity", "opacity"], ["cardBlur", "blur"], ["cardGlow", "glow"]].forEach(([id, key]) => $(id).addEventListener("input", () => {
    const target = $("cardTarget").value;
    profile.studio.cards[target] = { ...(profile.studio.cards[target] || {}), [key]: Number($(id).value) };
    renderCard(); save(false);
  }));
  $("resetCard").addEventListener("click", () => { delete profile.studio.cards[$("cardTarget").value]; renderCard(); save(false); });
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-frame]");
    if (!btn) return;
    if (btn.disabled) {
      toast(btn.title || "Esta moldura ainda não está disponível para este perfil.");
      return;
    }
    profile.moldura = btn.dataset.frame;
    syncFrameSelection();
    save(false);
  });
  $("profilePreview").addEventListener("load", () => {
    try { $("profilePreview").contentWindow.postMessage({ type: "HATTZ_STUDIO_PREVIEW_REFRESH", frames: frameAssets }, location.origin); } catch {}
  });
  $("saveStudio")?.addEventListener("click", () => save(true));

  let themeAllowed = false;
  let profileCode = "";
  let entitlementsInfo = null;
  let entitlementsPromise = null;
  function fetchEntitlements(normalized) {
    if (entitlementsInfo) return Promise.resolve(entitlementsInfo);
    if (entitlementsPromise) return entitlementsPromise;
    entitlementsPromise = fetch(`${API}/api/profiles/${normalized}/entitlements`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível verificar os cargos deste perfil.");
        entitlementsInfo = await response.json();
        window.HATTZ_REMOTE_BENEFITS = entitlementsInfo.benefits || {};
        window.HATTZ_REMOTE_COLLECTIONS = entitlementsInfo.collections || [];
        return entitlementsInfo;
      })
      .finally(() => { entitlementsPromise = null; });
    return entitlementsPromise;
  }
  async function loadThemeAccess() {
    profileCode = window.HATTZ_CORE?.publicCodeKey?.(profileId)
      ? localStorage.getItem(window.HATTZ_CORE.publicCodeKey(profileId)) || ""
      : localStorage.getItem(`hattz-share-code:${profileId}`) || "";
    const normalized = window.HATTZ_CORE?.normalizeCode?.(profileCode) || profileCode.replace(/[^A-Z0-9]/gi, "").replace(/^HTZ/i, "").toUpperCase();
    const nav = $("themeNav"), panel = $("panel-theme");
    if (!API || !normalized) { nav.hidden = true; panel.hidden = true; return; }
    try {
      window.HATTZ_CORE?.setConnectionState?.("syncing", "Permissões do Studio");
      const info = await fetchEntitlements(normalized);
      themeAllowed = info.studioThemeAllowed === true;
      nav.hidden = !themeAllowed; panel.hidden = !themeAllowed;
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
  function frameAccessRule(frame, asset = parseAsset(frame.asset_json)) {
    const mode = ["public", "vip", "role"].includes(asset.accessMode)
      ? asset.accessMode
      : (["premium", "elite"].includes(String(frame.rarity || "basic").toLowerCase()) ? "vip" : "public");
    return { mode, requiredRoleId: mode === "role" ? String(asset.requiredRoleId || "").trim().toLowerCase() : "" };
  }
  function frameAvailability(frame, info = {}) {
    const rule = frameAccessRule(frame);
    const roles = Array.isArray(info.roles) ? info.roles : [];
    if (rule.mode === "public") return { available: true, kind: "public", hint: "Pública · qualquer perfil pode usar." };
    if (rule.mode === "vip") {
      const available = info.vip === true;
      return { available, kind: "vip", hint: available ? "VIP ativo · liberada para este perfil." : "Bloqueada · exige VIP ativo." };
    }
    const role = rule.requiredRoleId ? roles.find(item => String(item.id).toLowerCase() === rule.requiredRoleId) : null;
    const roleName = role?.label || rule.requiredRoleId || "cargo selecionado";
    return {
      available: Boolean(role), kind: "role",
      hint: role ? `Cargo ${roleName} · liberada para este perfil.` : `Bloqueada · exige o cargo ${roleName}.`
    };
  }
  function renderFrameCatalog(catalogFrames = [], info = {}) {
    const selected = catalogFrames.find(frame => frame.id === profile.moldura);
    if (selected && !frameAvailability(selected, info).available) {
      // O backend também remove molduras sem acesso; mantém o Studio coerente.
      profile.moldura = "none";
      window.HATTZ_CORE?.setProfile?.(profileId, profile);
    }
    // Envia os PNGs liberados para a prévia: a moldura selecionada precisa
    // envolver o avatar mesmo quando o perfil ainda não foi publicado.
    for (const key of Object.keys(frameAssets)) delete frameAssets[key];
    for (const frame of catalogFrames) {
      if (!frameAvailability(frame, info).available) continue;
      const asset = parseAsset(frame.asset_json);
      if (asset.imageData) frameAssets[frame.id] = asset;
    }
    applyPreview();
    const byId = new Map(catalogFrames.map(frame => [frame.id, frame]));
    for (const button of document.querySelectorAll("button[data-frame]")) {
      const frame = byId.get(button.dataset.frame);
      if (!frame || button.dataset.frame === "none") continue;
      const state = frameAvailability(frame, info);
      button.disabled = !state.available;
      button.title = state.available ? (frame.description || frame.name || state.hint) : state.hint;
    }
    const root = $("studioFrameCatalog");
    if (!root) return;
    if (!catalogFrames.length) {
      root.innerHTML = '<p class="muted">Nenhuma moldura publicada no catálogo.</p>';
      return;
    }
    const kindLabels = { public: "Pública", vip: "VIP", role: "Cargo" };
    root.innerHTML = catalogFrames.map((frame) => {
      const asset = parseAsset(frame.asset_json);
      const state = frameAvailability(frame, info);
      const label = state.available ? "Disponível" : "Bloqueada";
      const hint = state.available
        ? (frame.description ? `${frame.description} · ${state.hint}` : state.hint)
        : state.hint;
      const preview = asset.imageData
        ? `<span class="frame-catalog-preview"><img src="${escapeText(asset.imageData)}" alt=""></span>`
        : '<span class="frame-catalog-preview plain">○</span>';
      const action = state.available
        ? `<button class="frame-option frame-catalog-button" type="button" data-frame="${escapeText(frame.id)}" title="${escapeText(hint)}">${preview}<b>${escapeText(frame.name || frame.id)}</b><small>${escapeText(frame.rarityLabel || frame.rarity || "Especial")}</small></button>`
        : `<div class="frame-option frame-catalog-button locked" title="${escapeText(hint)}">${preview}<b>${escapeText(frame.name || frame.id)}</b><small>🔒 ${escapeText(kindLabels[state.kind])}</small></div>`;
      return `<article class="frame-catalog-item ${state.available ? "" : "locked"}"><span class="frame-catalog-status ${state.available ? "available" : "locked"}">${label}</span>${action}<small class="frame-catalog-kind">${escapeText(kindLabels[state.kind])}</small><small class="frame-catalog-hint">${escapeText(hint)}</small></article>`;
    }).join("");
    syncFrameSelection();
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
        try { info = await fetchEntitlements(normalized); } catch {}
      }
      window.HATTZ_REMOTE_BENEFITS = info.benefits || {};
      window.HATTZ_REMOTE_COLLECTIONS = info.collections || [];
      renderFrameCatalog(data.frames || [], info);
      const pickerHost = $("badgeSelfPicker");
      if (pickerHost && window.HattzBadgePicker) {
        const pickerState = await window.HattzBadgePicker.load(profileId, { catalog: data }).catch(() => ({ available: false, badges: [], selected: [] }));
        window.HattzBadgePicker.render(pickerHost, pickerState, {
          profileId,
          saveLabel: "Salvar minhas insígnias",
          onSaved: async () => {
            entitlementsInfo = null;
            toast("Insígnias atualizadas.");
            try { $("profilePreview")?.contentWindow?.postMessage({ type: "HATTZ_STUDIO_PREVIEW_REFRESH" }, location.origin); } catch {}
            await loadCatalog();
          }
        });
      }
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

  $("reloadCatalog")?.addEventListener("click", loadCatalog);
  $("reloadCollections")?.addEventListener("click", loadCatalog);
  document.addEventListener("hattz:menu", (event) => {
    const { action, panel } = event.detail || {};
    if (panel) {
      const nav = document.querySelector(`.studio-nav[data-panel="${panel}"]`);
      if (nav && !nav.hidden) {
        nav.click();
        $(`panel-${panel}`)?.scrollIntoView({ block: "start" });
      }
      return;
    }
    if (action === "theme") $("openThemeCustomizer")?.click();
    if (action === "save") save(true);
    if (action === "back") window.location.href = profileHref;
  });
  setupStatus();
  renderGlass(); renderAvatar(); renderCard();
  loadCatalog();
  loadThemeAccess();
})();
