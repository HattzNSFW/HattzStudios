/* Hättz Suite — ferramentas locais compartilhadas por Share, Studio e Control.
   Histórico visual, pacote de estilo, comparação de perfis, backup e pré-voo de mídia.
   Sem rede, sem telemetria e sem mídia binária nestes arquivos. */
(() => {
  "use strict";

  if (window.HATTZ_SUITE) return;

  const params = new URLSearchParams(location.search);
  const profileId = ["perfil-1", "perfil-2"].includes(params.get("profile")) ? params.get("profile") : "perfil-1";
  const page = /control\.html/i.test(location.pathname) ? "control" : /studio\.html/i.test(location.pathname) ? "studio" : "share";
  const core = () => window.HATTZ_CORE;
  const history = () => window.HATTZ_HISTORY;
  const liquid = () => window.HattzLiquidGlass;

  let modal, body, tabsEl, dock, toastTimer = 0;
  let activeTab = "historico";
  const BASE_TABS = [
    ["historico", "Histórico"],
    ["estilo", "Estilo"],
    ["perfis", "Perfis"],
    ["backup", "Backup"],
    ["atalhos", "Atalhos"]
  ];
  const extraPanels = new Map();
  const renderers = {
    historico: renderHistory,
    estilo: renderStyle,
    perfis: renderCompare,
    backup: renderBackup,
    atalhos: renderHelp
  };

  function mountTab(name, label) {
    if (!tabsEl || !body) return;
    if (tabsEl.querySelector(`[data-suite-tab="${name}"]`)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.suiteTab = name;
    button.textContent = label;
    button.addEventListener("click", () => switchTab(name));
    tabsEl.appendChild(button);
    const panel = document.createElement("section");
    panel.className = "hattz-suite-panel";
    panel.dataset.suitePanel = name;
    body.appendChild(panel);
  }

  function addTab(name, label, render) {
    const id = String(name || "").trim();
    if (!id || renderers[id]) return false;
    renderers[id] = typeof render === "function" ? render : () => {};
    extraPanels.set(id, { label: String(label || id), render: renderers[id] });
    mountTab(id, label);
    if (activeTab === id) switchTab(id);
    return true;
  }

  const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = (value) => { try { return JSON.parse(JSON.stringify(value)); } catch { return value; } };
  const storageKey = (id) => `hattz2:local-backup:${id || profileId}`;

  function notify(text) {
    let el = document.querySelector(".hattz-suite-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "hattz-suite-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 3200);
  }

  function safeProfile(profile) {
    const copy = clone(profile || {});
    for (const key of ["share", "shareCode", "publicCode", "privateKey", "ownerKey", "ownerToken", "credential"]) delete copy[key];
    return copy;
  }

  function historyKeys() {
    if (page === "studio") return [`studio:${profileId}`, `liquid:studio`];
    if (page === "control") return ["liquid:control"];
    return [`profile:${profileId}`, "liquid:share"];
  }

  function applySnapshot(key, value) {
    if (key.startsWith("liquid:")) {
      liquid()?.restoreStore?.(value);
      return true;
    }
    const name = key.startsWith("studio:") ? "hattz:restore-studio" : "hattz:restore-profile";
    window.dispatchEvent(new CustomEvent(name, { detail: clone(value) }));
    return true;
  }

  function formatWhen(at) {
    if (!at) return "—";
    try { return new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    catch { return "—"; }
  }

  function renderHistory() {
    const root = body.querySelector('[data-suite-panel="historico"]');
    root.textContent = "";
    if (!history()) {
      root.innerHTML = '<p class="hattz-suite-hint">Histórico indisponível nesta página.</p>';
      return;
    }
    for (const key of historyKeys()) {
      const section = document.createElement("section");
      section.className = "hattz-suite-row";
      const title = document.createElement("strong");
      title.textContent = key.startsWith("liquid:") ? "Tema desta tela" : key.startsWith("studio:") ? "Studio" : "Perfil";
      const list = document.createElement("div");
      list.className = "hattz-suite-timeline";
      const entries = history().timeline(key);
      if (!entries.length) {
        const empty = document.createElement("small");
        empty.textContent = "Nenhum ponto salvo ainda.";
        list.appendChild(empty);
      }
      for (const entry of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.current = String(entry.current);
        const label = document.createElement("span");
        label.textContent = `${entry.current ? "● " : ""}${entry.label}`;
        const when = document.createElement("small");
        when.textContent = formatWhen(entry.at);
        button.append(label, when);
        button.addEventListener("click", () => {
          const snapshot = history().jump(key, entry.index);
          if (snapshot !== null && applySnapshot(key, snapshot)) {
            notify(`Restaurado: ${entry.label}`);
            renderHistory();
          }
        });
        list.appendChild(button);
      }
      section.append(title, list);
      root.appendChild(section);
    }
  }

  function readPackageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result || ""));
          if (!data || data.app !== "hattz-style" || Number(data.version) !== 1) throw new Error("Pacote incompatível.");
          resolve(data);
        } catch (error) { reject(error); }
      };
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsText(file);
    });
  }

  function applyPackage(pkg) {
    if (pkg.liquid) liquid()?.restoreStore?.(pkg.liquid);
    if (pkg.themes && core()) core().setThemes(profileId, pkg.themes);
    if (pkg.profile) {
      const clean = safeProfile(pkg.profile);
      if (core()) core().setProfile(profileId, clean);
      window.dispatchEvent(new CustomEvent("hattz:restore-profile", { detail: clone(clean) }));
      if (clean.studio) window.dispatchEvent(new CustomEvent("hattz:restore-studio", { detail: clone(clean) }));
    }
    notify("Pacote de estilo aplicado neste navegador.");
  }

  function renderStyle() {
    const root = body.querySelector('[data-suite-panel="estilo"]');
    root.innerHTML = "";
    const card = document.createElement("section");
    card.className = "hattz-suite-row";
    const info = document.createElement("small");
    info.className = "hattz-suite-hint";
    info.textContent = "Exporta tema, vidro do Studio, cores, fonte e moldura. Nunca inclui código público, chave privada ou mídia.";
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "8px";

    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "primary";
    exportBtn.textContent = "Exportar .hattz.json";
    exportBtn.addEventListener("click", () => {
      const profile = core()?.getProfile?.(profileId) || {};
      const pkg = {
        app: "hattz-style",
        version: 1,
        savedAt: Date.now(),
        profileId,
        profile: safeProfile(profile),
        themes: core()?.getThemes?.(profileId) || [],
        liquid: liquid()?.getStore?.() || null
      };
      const text = JSON.stringify(pkg, null, 2);
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `hattz-estilo-${profileId}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const code = root.querySelector(".hattz-suite-code");
      if (code) code.textContent = text.slice(0, 4000);
      notify("Pacote de estilo exportado.");
    });

    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "secondary";
    importBtn.textContent = "Importar pacote";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.hidden = true;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try { applyPackage(await readPackageFile(file)); close(); }
      catch (error) { notify(error.message || "Pacote inválido."); }
      input.value = "";
    });
    importBtn.addEventListener("click", () => input.click());

    actions.append(exportBtn, importBtn, input);
    const code = document.createElement("code");
    code.className = "hattz-suite-code";
    code.textContent = "O conteúdo exportado aparece aqui para conferência.";
    card.append(info, actions, code);
    root.appendChild(card);
  }

  function styleFields(profile) {
    const p = safeProfile(profile);
    return {
      moldura: p.moldura, raridadeMoldura: p.raridadeMoldura,
      tema: p.tema, fonte: p.fonte, cores: p.cores, gradiente: p.gradiente,
      gradientIntensity: p.gradientIntensity, cardRadius: p.cardRadius,
      divider: p.divider, dividerColor: p.dividerColor, studio: p.studio
    };
  }

  function renderCompare() {
    const root = body.querySelector('[data-suite-panel="perfis"]');
    root.innerHTML = "";
    if (page === "control") {
      root.innerHTML = '<p class="hattz-suite-hint">A comparação de perfis locais está disponível no Share e no Studio.</p>';
      return;
    }
    const profiles = ["perfil-1", "perfil-2"].map(id => core()?.getProfile?.(id) || {});
    const grid = document.createElement("div");
    grid.className = "hattz-suite-preview";
    profiles.forEach((profile, index) => {
      const box = document.createElement("div");
      const rows = [
        ["Perfil", `Perfil ${index + 1}`],
        ["Nome", profile.nome || "—"],
        ["Moldura", profile.moldura || "—"],
        ["Fonte", profile.fonte || "Padrão"],
        ["Vidro", profile.studio?.glass?.opacity != null ? `${profile.studio.glass.opacity}%` : "—"],
        ["Itens", String((profile.estatisticas || []).length + (profile.detalhes || []).length)]
      ];
      for (const [label, value] of rows) {
        const span = document.createElement("span");
        span.textContent = label;
        const b = document.createElement("b");
        b.textContent = value;
        box.append(span, b);
      }
      grid.appendChild(box);
    });
    const actions = document.createElement("div");
    actions.className = "hattz-suite-row";
    [["Copiar estilo 1 → 2", "perfil-1", "perfil-2"], ["Copiar estilo 2 → 1", "perfil-2", "perfil-1"]].forEach(([label, from, to]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = label;
      button.addEventListener("click", () => {
        const source = core()?.getProfile?.(from) || {};
        const target = core()?.getProfile?.(to) || {};
        const next = { ...target, ...styleFields(source) };
        core()?.setProfile?.(to, next);
        backup(to, next);
        window.dispatchEvent(new CustomEvent("hattz:restore-profile", { detail: clone(next) }));
        notify(`Estilo copiado para ${to === "perfil-1" ? "Perfil 1" : "Perfil 2"}.`);
        renderCompare();
      });
      actions.appendChild(button);
    });
    const hint = document.createElement("small");
    hint.className = "hattz-suite-hint";
    hint.textContent = "Somente aparência: nome, credenciais e mídia de cada perfil permanecem separados.";
    root.append(grid, actions, hint);
  }

  function backup(id, profile) {
    if (page === "control") return false;
    const target = id || profileId;
    const data = {
      savedAt: Date.now(),
      profile: safeProfile(profile || core()?.getProfile?.(target) || {}),
      themes: core()?.getThemes?.(target) || [],
      liquid: liquid()?.getStore?.() || null
    };
    try { localStorage.setItem(storageKey(target), JSON.stringify(data)); return true; }
    catch { return false; }
  }

  function readBackup(id) {
    try {
      const raw = localStorage.getItem(storageKey(id || profileId));
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && typeof data === "object" ? data : null;
    } catch { return null; }
  }

  function renderBackup() {
    const root = body.querySelector('[data-suite-panel="backup"]');
    root.innerHTML = "";
    if (page === "control") {
      root.innerHTML = '<p class="hattz-suite-hint">O backup local acompanha os perfis do Share e do Studio.</p>';
      return;
    }
    const data = readBackup(profileId);
    const card = document.createElement("section");
    card.className = "hattz-suite-row";
    const info = document.createElement("small");
    info.className = "hattz-suite-hint";
    info.textContent = data ? `Último backup: ${new Date(data.savedAt).toLocaleString("pt-BR")}.` : "Nenhum backup local para este perfil.";
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "8px";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "primary";
    saveBtn.textContent = "Salvar agora";
    saveBtn.addEventListener("click", () => { notify(backup() ? "Backup local salvo." : "Não foi possível salvar o backup."); renderBackup(); });
    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.className = "secondary";
    restoreBtn.textContent = "Restaurar backup";
    restoreBtn.disabled = !data;
    restoreBtn.addEventListener("click", () => {
      if (!data) return;
      if (data.liquid) liquid()?.restoreStore?.(data.liquid);
      if (data.themes) core()?.setThemes?.(profileId, data.themes);
      if (data.profile) {
        const clean = safeProfile(data.profile);
        core()?.setProfile?.(profileId, clean);
        window.dispatchEvent(new CustomEvent("hattz:restore-profile", { detail: clone(clean) }));
        window.dispatchEvent(new CustomEvent("hattz:restore-studio", { detail: clone(clean) }));
      }
      notify("Backup restaurado neste navegador.");
    });
    actions.append(saveBtn, restoreBtn);
    card.append(info, actions);
    root.appendChild(card);
  }

  function renderHelp() {
    const root = body.querySelector('[data-suite-panel="atalhos"]');
    const rows = [
      ["Ctrl/Cmd + Z", "Desfazer última alteração local"],
      ["Ctrl/Cmd + Shift + Z", "Refazer alteração"],
      ["Ctrl + Y", "Refazer alternativo"],
      ["Esc", "Fechar janelas abertas"],
      ["?", "Abrir/fechar esta central"]
    ];
    if (page === "share") rows.push(["Alt + Shift + P", "Alternar entre Perfil 1 e Perfil 2"]);
    root.innerHTML = "";
    for (const [key, description] of rows) {
      const row = document.createElement("div");
      row.className = "hattz-suite-row";
      const strong = document.createElement("strong");
      strong.textContent = key;
      const small = document.createElement("small");
      small.textContent = description;
      row.append(strong, small);
      root.appendChild(row);
    }
  }

  function switchTab(name) {
    if (!renderers[name]) return;
    activeTab = name;
    body?.querySelectorAll("[data-suite-panel]").forEach(panel => panel.classList.toggle("is-active", panel.dataset.suitePanel === name));
    modal?.querySelectorAll("[data-suite-tab]").forEach(button => button.dataset.active = String(button.dataset.suiteTab === name));
    const panel = body?.querySelector(`[data-suite-panel="${name}"]`);
    try { renderers[name](panel); }
    catch (error) {
      if (new URLSearchParams(location.search).get("diag") === "1") console.error("[Hättz Suite]", name, error);
    }
  }

  function build() {
    dock = document.createElement("button");
    dock.type = "button";
    dock.className = "hattz-suite-dock";
    dock.setAttribute("aria-label", "Abrir central de ferramentas Hättz");
    dock.title = "Ferramentas Hättz (?)";
    dock.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.8l1.7 5.1 5.1 1.7-5.1 1.7L12 16.4l-1.7-5.1L5.2 9.6l5.1-1.7L12 2.8z" fill="currentColor"/><path d="M18.7 15.2l.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8.8-2.3z" fill="currentColor" opacity=".7"/></svg>';
    dock.addEventListener("click", () => open());
    document.body.appendChild(dock);

    const backdrop = document.createElement("div");
    backdrop.className = "hattz-suite-modal-backdrop";
    backdrop.hidden = true;
    backdrop.style.cssText = "position:fixed;inset:0;z-index:10990;display:grid;place-items:center;background:rgba(4,4,9,.62)";
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });

    modal = document.createElement("div");
    modal.className = "hattz-suite-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Central de ferramentas Hättz");
    const head = document.createElement("div");
    head.className = "modal-header";
    const title = document.createElement("div");
    title.innerHTML = '<p class="eyebrow">HÄTTZ TOOLS</p><h2>Central de ferramentas</h2>';
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "close-button";
    closeBtn.setAttribute("aria-label", "Fechar");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => close());
    head.append(title, closeBtn);

    body = document.createElement("div");
    body.className = "hattz-suite-body";

    tabsEl = document.createElement("div");
    tabsEl.className = "hattz-suite-tabs";
    for (const [name, label] of BASE_TABS) mountTab(name, label);
    for (const [name, info] of extraPanels) mountTab(name, info.label);

    modal.append(head, tabsEl, body);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    modal._backdrop = backdrop;

    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target?.isContentEditable || target?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (event.key === "?" || (event.key === "/" && event.shiftKey)) {
        event.preventDefault();
        if (!modal._backdrop.hidden) close(); else open();
        return;
      }
      if (event.key === "Escape" && !modal._backdrop.hidden) {
        const preview = document.getElementById("previewModal");
        if (preview && !preview.hidden) return;
        event.preventDefault();
        close();
      }
    });

    switchTab(activeTab);
    checkBackupNotice();
  }

  function open() {
    if (!modal || document.body.classList.contains("capture-mode")) return;
    modal._backdrop.hidden = false;
    switchTab(activeTab);
    modal.querySelector(".close-button")?.focus();
  }

  function close() {
    if (!modal) return;
    modal._backdrop.hidden = true;
    dock?.focus();
  }

  function checkBackupNotice() {
    if (page === "control") return;
    const current = core()?.getProfile?.(profileId);
    const data = readBackup(profileId);
    if (data && (!current || !Object.keys(current).length)) notify("Existe um backup local recente. Abra Ferramentas para restaurar.");
  }

  function preflight(input) {
    if (input.dataset.preflightBound) return;
    input.dataset.preflightBound = "1";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      input.parentElement?.querySelector(".hattz-media-preflight")?.remove();
      const card = document.createElement("div");
      card.className = "hattz-media-preflight";
      const mb = (file.size / 1048576).toFixed(1);
      const parts = [`${file.name} · ${mb} MB · ${file.type || "tipo não informado"}`];
      let level = "ok";
      if (file.size > 250 * 1048576) { level = "error"; parts.push("Arquivo muito grande: reduza antes de publicar."); }
      else if (file.size > 75 * 1048576) { level = "warn"; parts.push("Arquivo grande: a publicação pode demorar."); }
      card.dataset.level = level;
      card.textContent = parts.join(" · ");
      input.insertAdjacentElement("afterend", card);

      const url = URL.createObjectURL(file);
      const clean = () => URL.revokeObjectURL(url);
      if (file.type.startsWith("image/")) {
        const img = new Image();
        img.onload = () => { card.textContent += ` · ${img.naturalWidth}×${img.naturalHeight}px`; clean(); };
        img.onerror = clean;
        img.src = url;
      } else if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
        const media = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
        media.preload = "metadata";
        media.onloadedmetadata = () => {
          if (Number.isFinite(media.duration)) card.textContent += ` · ${Math.round(media.duration)}s`;
          clean();
        };
        media.onerror = clean;
        media.src = url;
      } else clean();
    });
  }

  function bindPreflight() {
    document.querySelectorAll('input[type="file"]').forEach(input => {
      if (input.id === "stylePackageFile") return;
      preflight(input);
    });
  }

  const api = Object.freeze({
    open,
    close,
    backup,
    notify,
    registerTab: addTab,
    get profileId() { return profileId; },
    get scope() { return page; }
  });
  window.HATTZ_SUITE = api;

  function init() {
    build();
    bindPreflight();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
