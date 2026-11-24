/* Hättz Admin Suite — abas extras do Control dentro da central de ferramentas.
   Auditoria com filtros/CSV, concessão em massa com prévia, agendamentos locais,
   snapshots do catálogo e painel de saúde. Sem segredos no armazenamento local. */
(() => {
  "use strict";

  const API = String(window.HATTZ_CORE?.apiBase?.() || window.HATTZ_SHARE_CONFIG?.apiBase || "https://hattz-share-api.kl-santdev.workers.dev").replace(/\/+$/, "");
  const SCHEDULE_KEY = "hattz2:admin-schedule:control";
  const SNAPSHOT_KEY = "hattz2:catalog-snapshot:control";
  const SESSION_KEY = "hattz_control_session";

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const clear = (root) => { root.textContent = ""; return root; };
  const notify = (text) => window.HATTZ_SUITE?.notify?.(text);

  async function api(path, options = {}) {
    const token = sessionStorage.getItem(SESSION_KEY) || "";
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
    return data;
  }

  function normalizeCode(value) {
    const raw = String(value || "").toUpperCase().trim().replace(/^HTZ-?/, "").replace(/-/g, "");
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(raw) ? raw : null;
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function when(at) {
    if (!at) return "—";
    try { return new Date(Number(at)).toLocaleString("pt-BR"); } catch { return "—"; }
  }

  function readLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : fallback;
      return Array.isArray(data) ? data : fallback;
    } catch { return fallback; }
  }

  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  // ---- Saúde do ecossistema -------------------------------------------------
  function healthPanel(root) {
    clear(root);
    root.appendChild(el("small", "hattz-suite-hint", "Leitura do dashboard administrativo: contadores D1, uso de armazenamento e integridade dos catálogos."));
    const grid = el("div", "hattz-suite-preview");
    root.appendChild(grid);
    const actions = el("div", "hattz-suite-row");
    const refresh = el("button", "secondary", "Atualizar dados");
    actions.appendChild(refresh);
    root.appendChild(actions);

    async function load() {
      grid.textContent = "Carregando…";
      try {
        const data = await api("/api/admin/dashboard");
        const storage = data.storage || {};
        const profiles = data.profiles || {};
        const media = data.media || {};
        const ecosystem = data.ecosystem || {};
        const security = data.security || {};
        const catalogValue = ecosystem.catalog;
        const catalogCount = Array.isArray(catalogValue) ? catalogValue.length
          : catalogValue && typeof catalogValue === "object" ? Object.keys(catalogValue).length
          : (catalogValue ?? "—");
        clear(grid);
        const cards = [
          ["Perfis", String(profiles.total ?? "—")],
          ["Ativos", String(profiles.active ?? "—")],
          ["VIP ativos", String(profiles.vip ?? "—")],
          ["Mídias", String(media.total ?? "—")],
          ["Uso do storage", `${(Number(storage.usagePercent) || 0).toFixed(1)}%`],
          ["Divergência", formatBytes(storage.counterDriftBytes || 0)],
          ["Sessões ativas", String(security.activeSessions ?? "—")],
          ["Catálogo", String(catalogCount)]
        ];
        for (const [label, value] of cards) {
          const box = el("div");
          box.append(el("span", "", label), el("b", "", value));
          grid.appendChild(box);
        }
        const details = el("div", "hattz-suite-row");
        details.appendChild(el("strong", "", "Detalhes"));
        details.appendChild(el("small", "hattz-suite-hint",
          `Insígnias: ${ecosystem.badges ?? "—"} · Molduras: ${ecosystem.frames ?? "—"} · Cargos: ${ecosystem.roles ?? "—"} · ` +
          `Maior perfil: ${formatBytes(storage.largestProfiles?.[0]?.bytes || 0)} · Fonte: ${storage.accountingSource || "profile_media"}.`
        ));
        root.appendChild(details);
      } catch (error) {
        grid.textContent = error.message || "Não foi possível carregar o dashboard.";
      }
    }
    refresh.addEventListener("click", load);
    load();
  }

  // ---- Auditoria avançada ---------------------------------------------------
  function auditPanel(root) {
    clear(root);
    let events = [];
    const filters = { q: "", action: "", period: "all" };

    root.appendChild(el("small", "hattz-suite-hint", "Filtros locais sobre os eventos mais recentes; a exportação gera um CSV somente neste navegador."));
    const controls = el("div", "hattz-admin-form");
    const search = el("input");
    search.type = "search";
    search.placeholder = "Buscar ação, alvo ou detalhe";
    search.setAttribute("aria-label", "Buscar eventos de auditoria");
    const action = el("select");
    action.setAttribute("aria-label", "Filtrar por ação");
    action.appendChild(new Option("Todas as ações", ""));
    const period = el("select");
    period.setAttribute("aria-label", "Filtrar por período");
    for (const [value, label] of [["all", "Qualquer período"], ["1", "Últimas 24 h"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"]]) {
      period.appendChild(new Option(label, value));
    }
    const exportBtn = el("button", "secondary", "Exportar CSV");
    const reloadBtn = el("button", "primary", "Atualizar");
    controls.append(search, action, period, exportBtn, reloadBtn);
    root.appendChild(controls);

    const counter = el("small", "hattz-suite-hint", "Nenhum evento carregado.");
    root.appendChild(counter);
    const wrap = el("div", "hattz-admin-table-wrap");
    const table = el("table", "hattz-admin-table");
    const head = el("thead");
    const headRow = el("tr");
    for (const label of ["Data", "Ação", "Detalhes", "Alvo"]) headRow.appendChild(el("th", "", label));
    head.appendChild(headRow);
    const tbody = el("tbody");
    table.append(head, tbody);
    wrap.appendChild(table);
    root.appendChild(wrap);

    function filtered() {
      const query = filters.q.toLocaleLowerCase("pt-BR");
      const cutoff = filters.period === "all" ? 0 : Date.now() - Number(filters.period) * 86400000;
      return events.filter((event) => {
        if (filters.action && event.action !== filters.action) return false;
        if (cutoff && Number(event.created_at) < cutoff) return false;
        if (!query) return true;
        return `${event.action || ""} ${event.target || ""} ${JSON.stringify(event.details || {})}`.toLocaleLowerCase("pt-BR").includes(query);
      });
    }

    function render() {
      const rows = filtered();
      counter.textContent = `${rows.length} de ${events.length} eventos exibidos · retenção de 90 dias no servidor.`;
      clear(tbody);
      if (!rows.length) {
        const tr = el("tr");
        const td = el("td", "", "Nenhum evento corresponde aos filtros.");
        td.colSpan = 4;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }
      for (const event of rows) {
        const tr = el("tr");
        tr.append(
          el("td", "", when(event.created_at)),
          el("td", "", event.action || "—"),
          el("td", "", JSON.stringify(event.details || {})),
          el("td", "", event.target || "—")
        );
        tbody.appendChild(tr);
      }
    }

    function refreshActions() {
      const current = action.value;
      const actions = [...new Set(events.map((event) => event.action).filter(Boolean))].sort();
      action.textContent = "";
      action.appendChild(new Option("Todas as ações", ""));
      for (const name of actions) action.appendChild(new Option(name, name));
      action.value = actions.includes(current) ? current : "";
      filters.action = action.value;
    }

    async function load() {
      counter.textContent = "Carregando eventos…";
      try {
        const data = await api("/api/admin/audit?limit=200");
        events = Array.isArray(data.events) ? data.events : [];
        refreshActions();
        render();
      } catch (error) {
        counter.textContent = error.message || "Não foi possível carregar a auditoria.";
      }
    }

    search.addEventListener("input", () => { filters.q = search.value.trim(); render(); });
    action.addEventListener("change", () => { filters.action = action.value; render(); });
    period.addEventListener("change", () => { filters.period = period.value; render(); });
    reloadBtn.addEventListener("click", load);
    exportBtn.addEventListener("click", () => {
      const rows = filtered();
      const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      const lines = ["Data;Ação;Detalhes;Alvo"];
      for (const event of rows) {
        lines.push([when(event.created_at), event.action, JSON.stringify(event.details || {}), event.target].map(cell).join(";"));
      }
      const url = URL.createObjectURL(new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const link = el("a");
      link.href = url;
      link.download = `hattz-auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`${rows.length} eventos exportados em CSV.`);
    });

    load();
  }

  // ---- Concessão em massa ---------------------------------------------------
  function bulkPanel(root) {
    clear(root);
    root.appendChild(el("small", "hattz-suite-hint", "Cole um código por linha. A prévia valida e remove duplicados antes de qualquer alteração."));
    const form = el("div", "hattz-admin-form");
    const codes = el("textarea");
    codes.rows = 5;
    codes.placeholder = "HTZ-ABCDE-FGHIJ\nABCDEFGHIJ";
    codes.setAttribute("aria-label", "Códigos de perfil");
    const kind = el("select");
    kind.setAttribute("aria-label", "Tipo de concessão");
    for (const [value, label] of [["vip", "VIP"], ["role", "Cargo"], ["badge", "Insígnia"], ["frame", "Moldura"]]) {
      kind.appendChild(new Option(label, value));
    }
    const operation = el("select");
    operation.setAttribute("aria-label", "Operação");
    operation.append(new Option("Conceder", "grant"), new Option("Revogar", "revoke"));
    const itemId = el("input");
    itemId.type = "text";
    itemId.placeholder = "ID do cargo / insígnia / moldura";
    itemId.setAttribute("aria-label", "ID do item");
    const expires = el("input");
    expires.type = "datetime-local";
    expires.setAttribute("aria-label", "Validade opcional");
    const previewBtn = el("button", "secondary", "Prévia");
    const applyBtn = el("button", "primary", "Aplicar em massa");
    form.append(codes, kind, operation, itemId, expires, previewBtn, applyBtn);
    root.appendChild(form);
    const result = el("div", "hattz-suite-row");
    root.appendChild(result);

    function syncFields() {
      const needsId = kind.value !== "vip";
      itemId.hidden = !needsId;
      itemId.placeholder = kind.value === "role" ? "ID do cargo" : kind.value === "badge" ? "ID da insígnia" : "ID da moldura";
      expires.hidden = kind.value === "vip" ? operation.value === "revoke" : kind.value !== "role" || operation.value === "revoke";
    }

    function parseCodes() {
      const valid = [], invalid = [], duplicates = [], seen = new Set();
      for (const raw of codes.value.split(/[\r\n,;\s]+/).map((part) => part.trim()).filter(Boolean)) {
        const code = normalizeCode(raw);
        if (!code) { invalid.push(raw); continue; }
        if (seen.has(code)) { duplicates.push(code); continue; }
        seen.add(code);
        valid.push(code);
      }
      return { valid, invalid, duplicates };
    }

    function payload() {
      const action = operation.value;
      if (kind.value === "vip") {
        if (action === "revoke") return { vip: false };
        const stamp = expires.value ? Date.parse(expires.value) : null;
        return { vip: true, vipExpiresAt: Number.isFinite(stamp) && stamp > Date.now() ? stamp : null, benefits: { profileStorageLimitBytes: 524288000 } };
      }
      const id = String(itemId.value || "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) throw new Error("Informe um ID válido de cargo, insígnia ou moldura.");
      if (kind.value === "role") {
        const stamp = expires.value ? Date.parse(expires.value) : null;
        return { roleId: id, action, expiresAt: Number.isFinite(stamp) && stamp > Date.now() ? stamp : null };
      }
      if (kind.value === "badge") return { badgeId: id, action };
      return { frameId: id, action };
    }

    function pathFor(code) {
      return `/api/admin/profiles/${code}/${kind.value === "vip" ? "entitlements" : `${kind.value}s`}`;
    }

    function preview() {
      const parsed = parseCodes();
      result.textContent = `${parsed.valid.length} código(s) válido(s) · ${parsed.duplicates.length} duplicado(s) · ${parsed.invalid.length} inválido(s).` +
        (parsed.invalid.length ? ` Inválidos: ${parsed.invalid.slice(0, 8).join(", ")}.` : "");
      return parsed;
    }

    kind.addEventListener("change", syncFields);
    operation.addEventListener("change", syncFields);
    previewBtn.addEventListener("click", preview);
    applyBtn.addEventListener("click", async () => {
      const parsed = preview();
      if (!parsed.valid.length) { notify("Nenhum código válido para aplicar."); return; }
      if (!window.confirm(`Aplicar ${operation.value === "grant" ? "concessão" : "revogação"} a ${parsed.valid.length} perfil(is)?`)) return;
      let body;
      try { body = payload(); } catch (error) { notify(error.message); return; }
      applyBtn.disabled = true;
      let done = 0, failed = 0;
      for (const code of parsed.valid) {
        try {
          await api(pathFor(code), { method: kind.value === "vip" ? "PUT" : "POST", body: JSON.stringify(body) });
          done += 1;
        } catch { failed += 1; }
        result.textContent = `Processando… ${done + failed}/${parsed.valid.length} (${done} ok, ${failed} falhas)`;
      }
      applyBtn.disabled = false;
      notify(`Concluso: ${done} sucesso(s), ${failed} falha(s).`);
    });
    syncFields();
  }

  // ---- Agendamentos locais --------------------------------------------------
  function schedulePanel(root) {
    clear(root);
    let items = readLocal(SCHEDULE_KEY, []);
    root.appendChild(el("small", "hattz-suite-hint", "Fila local: executa enquanto esta aba estiver aberta. Não substitui um job do servidor e não armazena credenciais."));
    const form = el("div", "hattz-admin-form");
    const code = el("input");
    code.type = "text";
    code.placeholder = "HTZ-ABCDE-FGHIJ";
    code.setAttribute("aria-label", "Código do perfil");
    const operation = el("select");
    operation.setAttribute("aria-label", "Operação agendada");
    for (const [value, label] of [
      ["vip:grant", "Conceder VIP"], ["vip:revoke", "Revogar VIP"],
      ["role:grant", "Conceder cargo"], ["role:revoke", "Revogar cargo"],
      ["badge:grant", "Conceder insígnia"], ["badge:revoke", "Revogar insígnia"],
      ["frame:grant", "Conceder moldura"], ["frame:revoke", "Revogar moldura"]
    ]) operation.appendChild(new Option(label, value));
    const itemId = el("input");
    itemId.type = "text";
    itemId.placeholder = "ID do item (se aplicável)";
    itemId.setAttribute("aria-label", "ID do item agendado");
    const whenInput = el("input");
    whenInput.type = "datetime-local";
    whenInput.setAttribute("aria-label", "Data e hora");
    const addBtn = el("button", "primary", "Agendar");
    form.append(code, operation, itemId, whenInput, addBtn);
    root.appendChild(form);
    const list = el("div", "hattz-suite-timeline");
    root.appendChild(list);
    const counter = el("small", "hattz-suite-hint", "");
    root.appendChild(counter);

    function save() { writeLocal(SCHEDULE_KEY, items); }
    function payloadFor(item) {
      const [kind, action] = item.operation.split(":");
      if (kind === "vip") return action === "revoke" ? { vip: false } : { vip: true, vipExpiresAt: item.expiresAt || null, benefits: { profileStorageLimitBytes: 524288000 } };
      const id = String(item.itemId || "").trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) throw new Error("ID inválido no agendamento.");
      if (kind === "role") return { roleId: id, action, expiresAt: item.expiresAt || null };
      if (kind === "badge") return { badgeId: id, action };
      return { frameId: id, action };
    }
    function pathFor(item) {
      const kind = item.operation.split(":")[0];
      return `/api/admin/profiles/${item.code}/${kind === "vip" ? "entitlements" : `${kind}s`}`;
    }
    async function execute(item) {
      const kind = item.operation.split(":")[0];
      await api(pathFor(item), { method: kind === "vip" ? "PUT" : "POST", body: JSON.stringify(payloadFor(item)) });
    }
    function render() {
      clear(list);
      counter.textContent = `${items.length} item(ns) agendado(s).`;
      if (!items.length) list.appendChild(el("small", "hattz-suite-hint", "Nenhum agendamento pendente."));
      for (const item of items) {
        const row = el("div", "hattz-suite-row");
        row.appendChild(el("strong", "", `${item.code} · ${item.operation}`));
        row.appendChild(el("small", "hattz-suite-hint", `${when(item.executeAt)}${item.itemId ? ` · ${item.itemId}` : ""}`));
        const run = el("button", "secondary", "Executar agora");
        run.addEventListener("click", async () => {
          try { await execute(item); items = items.filter((entry) => entry.id !== item.id); save(); render(); notify("Agendamento executado."); }
          catch (error) { notify(error.message || "Falha ao executar agendamento."); }
        });
        const cancel = el("button", "quiet-button", "Cancelar");
        cancel.addEventListener("click", () => { items = items.filter((entry) => entry.id !== item.id); save(); render(); });
        row.append(run, cancel);
        list.appendChild(row);
      }
    }
    async function tick() {
      const due = items.filter((item) => Number(item.executeAt) <= Date.now());
      if (!due.length) return;
      for (const item of due) {
        try { await execute(item); items = items.filter((entry) => entry.id !== item.id); notify(`Agendamento executado: ${item.code}.`); }
        catch (error) { notify(`Falha em ${item.code}: ${error.message || "erro"}`); }
      }
      save();
      render();
    }
    addBtn.addEventListener("click", () => {
      const normalized = normalizeCode(code.value);
      const stamp = whenInput.value ? Date.parse(whenInput.value) : NaN;
      if (!normalized) { notify("Código inválido."); return; }
      if (!Number.isFinite(stamp) || stamp <= Date.now()) { notify("Escolha uma data futura."); return; }
      const [kind] = operation.value.split(":");
      const id = String(itemId.value || "").trim().toLowerCase();
      if (kind !== "vip" && !/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) { notify("Informe um ID válido."); return; }
      items.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, code: normalized, operation: operation.value, itemId: kind === "vip" ? "" : id, executeAt: stamp });
      save();
      code.value = "";
      itemId.value = "";
      whenInput.value = "";
      render();
      notify("Agendamento salvo neste navegador.");
    });
    render();
    const timer = setInterval(tick, 30000);
    root._cleanup = () => clearInterval(timer);
  }

  // ---- Catálogo e rollback --------------------------------------------------
  function catalogPanel(root) {
    clear(root);
    let snapshots = readLocal(SNAPSHOT_KEY, []);
    root.appendChild(el("small", "hattz-suite-hint", "Snapshots locais do catálogo. O rollback reaplica itens pelos endpoints administrativos e preserva concessões já feitas."));
    const actions = el("div", "hattz-suite-row");
    const saveBtn = el("button", "primary", "Salvar snapshot");
    const reloadBtn = el("button", "secondary", "Atualizar catálogo");
    actions.append(saveBtn, reloadBtn);
    root.appendChild(actions);
    const status = el("small", "hattz-suite-hint", "Carregando catálogo…");
    root.appendChild(status);
    const list = el("div", "hattz-suite-timeline");
    root.appendChild(list);

    async function read() {
      const [catalog, roles] = await Promise.all([api("/api/admin/catalog"), api("/api/admin/roles")]);
      return {
        frames: Array.isArray(catalog.frames) ? catalog.frames : [],
        badges: Array.isArray(catalog.badges) ? catalog.badges : [],
        roles: Array.isArray(roles.roles) ? roles.roles : []
      };
    }
    function render() {
      clear(list);
      status.textContent = `${snapshots.length} snapshot(s) local(is) · máximo de 5.`;
      if (!snapshots.length) list.appendChild(el("small", "hattz-suite-hint", "Nenhum snapshot salvo."));
      for (const snap of snapshots) {
        const row = el("div", "hattz-suite-row");
        row.appendChild(el("strong", "", when(snap.savedAt)));
        row.appendChild(el("small", "hattz-suite-hint", `${snap.roles?.length || 0} cargos · ${snap.badges?.length || 0} insígnias · ${snap.frames?.length || 0} molduras`));
        const restore = el("button", "primary", "Reaplicar");
        restore.addEventListener("click", async () => {
          if (!window.confirm("Reaplicar este snapshot ao catálogo remoto?")) return;
          restore.disabled = true;
          let ok = 0, failed = 0;
          for (const role of snap.roles || []) {
            try {
              await api(`/api/admin/roles/${encodeURIComponent(role.id)}`, {
                method: "PUT",
                body: JSON.stringify({ id: role.id, label: role.label, description: role.description || "", color: role.color || "#a78bfa", theme: role.theme || {} })
              });
              ok += 1;
            } catch { failed += 1; }
          }
          for (const badge of snap.badges || []) {
            try {
              await api(`/api/admin/catalog/badges/${encodeURIComponent(badge.id)}`, {
                method: "PUT",
                body: JSON.stringify({ name: badge.name, description: badge.description || "", category: badge.category || "community", rarityLevel: badge.rarityLevel || 1, icon: badge.icon || "✦", isPublic: badge.is_public !== 0 })
              });
              ok += 1;
            } catch { failed += 1; }
          }
          for (const frame of snap.frames || []) {
            let asset = {};
            try { asset = JSON.parse(frame.asset_json || "{}"); } catch {}
            try {
              await api(`/api/admin/catalog/frames/${encodeURIComponent(frame.id)}`, {
                method: "PUT",
                body: JSON.stringify({ name: frame.name, description: frame.description || "", rarityLevel: frame.rarityLevel || 1, asset })
              });
              ok += 1;
            } catch { failed += 1; }
          }
          restore.disabled = false;
          notify(`Rollback concluído: ${ok} item(ns), ${failed} falha(s).`);
        });
        const remove = el("button", "quiet-button", "Excluir");
        remove.addEventListener("click", () => { snapshots = snapshots.filter((entry) => entry.savedAt !== snap.savedAt); writeLocal(SNAPSHOT_KEY, snapshots); render(); });
        row.append(restore, remove);
        list.appendChild(row);
      }
    }
    saveBtn.addEventListener("click", async () => {
      try {
        const data = await read();
        snapshots.unshift({ savedAt: Date.now(), ...data });
        snapshots = snapshots.slice(0, 5);
        writeLocal(SNAPSHOT_KEY, snapshots);
        render();
        notify("Snapshot do catálogo salvo.");
      } catch (error) { notify(error.message || "Não foi possível salvar o snapshot."); }
    });
    reloadBtn.addEventListener("click", async () => {
      status.textContent = "Carregando catálogo…";
      try {
        const data = await read();
        status.textContent = `${data.roles.length} cargos · ${data.badges.length} insígnias · ${data.frames.length} molduras no catálogo remoto.`;
      } catch (error) { status.textContent = error.message || "Falha ao consultar o catálogo."; }
    });
    render();
    reloadBtn.click();
  }

  function install() {
    const suite = window.HATTZ_SUITE;
    if (!suite?.registerTab) return;
    const panels = new Map();
    for (const [name, label, builder] of [
      ["saude", "Saúde", healthPanel],
      ["auditoria", "Auditoria+", auditPanel],
      ["massa", "Em massa", bulkPanel],
      ["agendados", "Agendados", schedulePanel],
      ["catalogo", "Catálogo", catalogPanel]
    ]) {
      suite.registerTab(name, label, (root) => {
        const previous = panels.get(name);
        if (previous?._cleanup) previous._cleanup();
        builder(root);
        panels.set(name, root);
      });
    }
  }

  function start() {
    if (window.HATTZ_SUITE?.scope === "control") install();
    else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
