(() => {
  "use strict";
  const API = String(window.HATTZ_CORE?.apiBase?.() || window.HATTZ_SHARE_CONFIG?.apiBase || "https://hattz-share-api.kl-santdev.workers.dev").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const tokenKey = "hattz_control_session";
  let token = sessionStorage.getItem(tokenKey) || "";
  let page = 1;
  let totalPages = 1;
  let currentProfiles = [];
  let maintenanceAllowedCodes = new Set();
  let maintenanceTextareaCodes = new Set();
  let toastTimer;
  let ecosystemBenefits = [];
  let ecosystemCollections = [];
  let ecosystemRoles = [];
  let ecosystemBadges = [];
  let ecosystemFrames = [];
  let roleAssignmentRows = [];
  let studioRoleIds = new Set();
  let catalogItems = [];
  let catalogVisible = 12;
  let previewUrl = "";
  const loadedViews = new Set();
  let dashboardCache = null;
  let dashboardPromise = null;
  let rolesLoaded = false;
  const CATALOG_PAGE = 12;
  const statusLabels = { idle: "Pronto", online: "Sincronizado", offline: "Sem conexão", syncing: "Sincronizando…", degraded: "Serviço instável", error: "Falha" };

  function setupStatus() {
    const element = $("controlConnectionStatus");
    window.HATTZ_CORE?.subscribeConnection?.((state) => {
      if (!element) return;
      element.dataset.state = state.state;
      element.textContent = statusLabels[state.state] || statusLabels.idle;
      element.title = state.detail || element.textContent;
      element.hidden = state.state === "idle";
      element.classList.toggle("warning", ["offline", "error", "degraded"].includes(state.state));
    });
  }

  /* Deixa claro no login se a chave local ou a credencial remota é esperada.
     A origem vem do share-config.js, sem expor URLs secretas nem credenciais. */
  function setupLoginHint() {
    const hint = $("loginModeHint");
    if (!hint) return;
    hint.textContent = window.HATTZ_SHARE_CONFIG?.mode === "remote"
      ? "Site público: use a credencial administrativa do servidor. A chave local funciona apenas em localhost."
      : "Modo local: use a chave gravada em data/admin-key.txt.";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function formatBytes(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    if (n < 1024) return `${n} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = n / 1024, index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
    return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
  }
  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }
  const CHART_COLORS = ["#b99af0", "#6fd3c7", "#f0b86b", "#ef8fa8", "#7aa7f5", "#c9b5f1"];
  function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
  function percentOf(value, total) { return total > 0 ? Math.max(0, Math.min(100, Number(value) / Number(total) * 100)) : 0; }
  function donutSvg(percent, center, sub) {
    const radius = 62;
    const circumference = 2 * Math.PI * radius;
    const filled = circumference * percent / 100;
    return `<div class="donut-wrap"><svg viewBox="0 0 180 180" role="img" aria-label="Uso de ${escapeAttr(sub)}"><circle cx="90" cy="90" r="${radius}" fill="none" stroke="rgba(205,185,235,.12)" stroke-width="16"/><circle cx="90" cy="90" r="${radius}" fill="none" stroke="#b99af0" stroke-width="16" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}" transform="rotate(-90 90 90)"/><text x="90" y="88" text-anchor="middle" class="donut-center">${escapeHtml(center)}</text><text x="90" y="108" text-anchor="middle" class="donut-sub">${escapeHtml(sub).toUpperCase()}</text></svg></div>`;
  }
  function legendHtml(rows) {
    return `<div class="chart-legend">${rows.map((row, index) => `<div class="chart-legend-row"><span class="chart-legend-dot" style="--legend-color:${CHART_COLORS[index % CHART_COLORS.length]}"></span><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`).join("")}</div>`;
  }
  function barChartSvg(rows, color) {
    if (!rows.length) return '<p class="empty">Sem dados para este gráfico.</p>';
    const width = 420, rowHeight = 32, labelWidth = 116, barX = labelWidth + 8, barWidth = width - labelWidth - 62;
    const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
    const height = Math.max(60, rows.length * rowHeight + 12);
    const bars = rows.map((row, index) => {
      const value = Number(row.value) || 0;
      const bar = Math.max(2, barWidth * value / max);
      const y = 16 + index * rowHeight;
      return `<text x="${labelWidth}" y="${y + 4}" text-anchor="end" class="chart-bar-label">${escapeHtml(row.label)}</text><rect x="${barX}" y="${y - 9}" width="${bar.toFixed(1)}" height="14" rx="7" fill="${color}" opacity="${(0.92 - index * 0.1).toFixed(2)}"/><text x="${barX + bar + 8}" y="${y + 4}" class="chart-bar-value">${escapeHtml(row.display ?? row.value)}</text>`;
    }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de barras">${bars}</svg>`;
  }
  function lineChartSvg(days) {
    if (!days.length) return '<p class="empty">Sem dados para este gráfico.</p>';
    const width = 860, height = 210, left = 34, right = 14, top = 14, bottom = 30;
    const innerW = width - left - right, innerH = height - top - bottom;
    const max = Math.max(1, ...days.flatMap((day) => [day.audits, day.logins, day.failures, day.ipEvents]));
    const x = (index) => left + (days.length === 1 ? innerW / 2 : innerW * index / (days.length - 1));
    const y = (value) => top + innerH - innerH * (Number(value) || 0) / max;
    const series = [
      { key: "audits", label: "Auditoria", color: CHART_COLORS[0] },
      { key: "logins", label: "Logins", color: CHART_COLORS[1] },
      { key: "ipEvents", label: "Eventos IP", color: CHART_COLORS[2] },
      { key: "failures", label: "Falhas", color: CHART_COLORS[3] }
    ];
    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const gy = top + innerH * ratio;
      return `<line x1="${left}" y1="${gy}" x2="${width - right}" y2="${gy}" class="chart-grid-line"/><text x="0" y="${gy + 4}" class="chart-bar-label">${Math.round(max * (1 - ratio))}</text>`;
    }).join("");
    const paths = series.map((item) => {
      const points = days.map((day, index) => `${x(index).toFixed(1)},${y(day[item.key]).toFixed(1)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    }).join("");
    const areaPoints = `${left},${top + innerH} ${days.map((day, index) => `${x(index).toFixed(1)},${y(day.audits).toFixed(1)}`).join(" ")} ${x(days.length - 1).toFixed(1)},${top + innerH}`;
    const labels = days.map((day, index) => (index % 2 === 0 || days.length <= 7)
      ? `<text x="${x(index)}" y="${height - 8}" text-anchor="middle" class="chart-bar-label">${escapeHtml(day.label)}</text>` : "").join("");
    return `<div style="display:grid;gap:10px;width:100%"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Atividade dos últimos 14 dias"><defs><linearGradient id="hattzAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b99af0" stop-opacity=".28"/><stop offset="100%" stop-color="#b99af0" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="${areaPoints}" fill="url(#hattzAreaGradient)"/>${paths}${labels}</svg>${legendHtml(series.map((item) => ({ label: item.label, value: days.reduce((sum, day) => sum + day[item.key], 0) })))}</div>`;
  }
  function notify(message) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3600);
  }
  async function api(path, options = {}, authenticated = true) {
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (authenticated && token) headers.set("Authorization", `Bearer ${token}`);
    window.HATTZ_CORE?.setConnectionState?.("syncing", path);
    try {
      const response = await fetch(`${API}${path}`, { ...options, headers, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.error || `Falha HTTP ${response.status}`;
        if (response.status === 401 && authenticated) {
          const errorEl = $("loginError");
          if (errorEl) errorEl.textContent = message;
          logout(false);
        }
        throw new Error(message);
      }
      window.HATTZ_CORE?.setConnectionState?.("online");
      return data;
    } catch (error) {
      window.HATTZ_CORE?.setConnectionState?.(error.status >= 500 ? "degraded" : "offline", error.message);
      throw error;
    }
  }
  function showApp(isLogged) {
    $("loginView").hidden = isLogged;
    $("appView").hidden = !isLogged;
    if (isLogged) loadOverview();
  }
  function logout(callApi = true) {
    if (callApi && token) api("/api/admin/auth/logout", { method: "POST", body: "{}" }).catch(() => {});
    token = "";
    sessionStorage.removeItem(tokenKey);
    showApp(false);
  }
  async function login(event) {
    event.preventDefault();
    const button = $("loginForm").querySelector("button");
    button.disabled = true;
    $("loginError").textContent = "";
    try {
      const result = await api("/api/admin/auth/login", { method: "POST", body: JSON.stringify({ password: $("adminPassword").value }) }, false);
      token = result.token;
      sessionStorage.setItem(tokenKey, token);
      $("adminPassword").value = "";
      showApp(true);
      notify("Acesso autorizado.");
    } catch (error) { $("loginError").textContent = error.message; notify(error.message); }
    finally { button.disabled = false; }
  }
  function setView(name) {
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    if (name === "profiles") loadProfiles();
    if (name === "ecosystem" || name === "roles" || name === "badges" || name === "frames") {
      if (!loadedViews.has(name)) {
        loadedViews.add(name);
        if (name === "roles") loadRolesView();
        else if (name === "badges") loadBadgesView();
        else if (name === "frames") loadFramesView();
        else loadEcosystem();
      }
    }
    if (name === "storage") loadStorage();
    if (name === "maintenance") loadMaintenance();
    if (name === "ip") loadIp();
    if (name === "audit") loadAudit();
    if (name === "security") loadCredential();
  }
  function getDashboard(force = false) {
    if (force) dashboardCache = null;
    if (dashboardCache) return Promise.resolve(dashboardCache);
    if (dashboardPromise) return dashboardPromise;
    dashboardPromise = api("/api/admin/dashboard")
      .then((data) => { dashboardCache = data; return data; })
      .finally(() => { dashboardPromise = null; });
    return dashboardPromise;
  }
  async function loadOverview(force = false) {
    try {
      const data = await getDashboard(force);
      const storage = data.storage || {};
      const profiles = data.profiles || {};
      const media = data.media || {};
      const ecosystem = data.ecosystem || {};
      const activity = data.activity || { days: [], totals: {} };
      const security = data.security || {};
      const usage = Number(storage.usagePercent) || 0;
      $("apiStatus").textContent = "Operacional";
      $("apiStatus").classList.remove("warning");
      $("overviewMetrics").innerHTML = [
        ["Perfis na nuvem", profiles.total ?? "—", `de ${storage.maxProfiles ?? "—"} permitidos`],
        ["Armazenamento usado", formatBytes(storage.totalBytes), `${usage.toFixed(1)}% da capacidade`],
        ["Espaço disponível", formatBytes(storage.remainingBytes), "capacidade global"],
        ["Mídias registradas", media.total ?? "—", `${(media.byType || []).length} tipos de mídia`],
        ["Perfis VIP", profiles.vip ?? "—", "benefício ativo"],
        ["Sessões administrativas", security.activeSessions ?? "—", "neste momento"]
      ].map(([label, value, hint]) => `<article class="metric glass"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></article>`).join("");
      $("overviewStorageBar").style.width = `${Math.min(100, Math.max(0, usage))}%`;
      $("overviewStorageText").textContent = `${formatBytes(storage.totalBytes)} / ${formatBytes(storage.maxBytes)}`;
      $("systemSummary").textContent = `${profiles.total ?? 0} perfis cadastrados · ${profiles.active ?? 0} ativos · ${storage.remainingProfilesByCount ?? "—"} vagas por quantidade.`;

      $("storageDonut").innerHTML = donutSvg(usage, `${usage.toFixed(1)}%`, "em uso");
      $("storageDonutCaption").textContent = `${formatBytes(storage.totalBytes)} de ${formatBytes(storage.maxBytes)} · ${formatBytes(storage.remainingBytes)} livres.`;

      const statusRows = [...(profiles.byStatus || []), { label: "Com VIP", value: profiles.vip || 0 }];
      $("profilesChart").innerHTML = barChartSvg(statusRows, CHART_COLORS[0]);
      $("profilesChartCaption").textContent = `${profiles.active || 0} ativos · ${profiles.suspended || 0} suspensos · ${profiles.official || 0} oficiais protegidos.`;

      const mediaRows = (media.byType || []).slice(0, 6).map((row) => ({ label: row.label, value: row.bytes, display: `${row.count} · ${formatBytes(row.bytes)}` }));
      $("mediaChart").innerHTML = barChartSvg(mediaRows, CHART_COLORS[1]);
      $("mediaChartCaption").textContent = `${media.total || 0} arquivos registrados no armazenamento ativo.`;

      $("activityChart").innerHTML = lineChartSvg(activity.days || []);
      const totals = activity.totals || {};
      $("activityChartCaption").textContent = `${totals.audits || 0} ações de auditoria · ${totals.logins || 0} logins · ${totals.failures || 0} falhas · ${totals.ipEvents || 0} eventos de IP.`;

      const largest = storage.largestProfiles || [];
      $("dashboardStorageTable").innerHTML = largest.length ? largest.map((item) => {
        const bytes = Number(item.storage_bytes || 0);
        return `<tr><td><span class="code-cell">${escapeHtml(item.code)}</span></td><td>${escapeHtml(item.media_count ?? "—")}</td><td>${formatBytes(bytes)}</td><td>${percentOf(bytes, storage.totalBytes).toFixed(1)}%</td></tr>`;
      }).join("") : '<tr><td colspan="4" class="empty">Sem mídias registradas.</td></tr>';

      const catalog = (ecosystem.catalog || []).slice(0, 14);
      $("dashboardCatalogTable").innerHTML = catalog.length ? catalog.map((item) => `<tr><td>${escapeHtml(item.kind)}</td><td><strong>${escapeHtml(item.name)}</strong><span class="sub-cell">${escapeHtml(item.id)}</span></td><td>${escapeHtml(item.rarity)}</td><td>${item.enabled ? "Ativo" : "Desativado"}</td><td>${Number(item.grants) || 0}</td></tr>`).join("") : '<tr><td colspan="5" class="empty">Nenhum item publicado.</td></tr>';

      const maintenance = security.maintenance || {};
      $("dashboardSecurityTable").innerHTML = [
        ["Sessões ativas", security.activeSessions ?? "—", "sessões administrativas válidas"],
        ["Tentativas bloqueadas", security.blockedLoginAttempts ?? 0, "limites de login em vigor"],
        ["Eventos de IP", security.ipEvents ?? 0, "registros retidos para segurança"],
        ["Manutenção", maintenance.enabled ? "Ativa" : "Desativada", `${maintenance.allowlist || 0} códigos liberados`]
      ].map(([label, value, detail]) => `<tr><td>${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td><td>${escapeHtml(detail)}</td></tr>`).join("");

      $("dashboardActivityTable").innerHTML = (activity.days || []).slice().reverse().map((day) => `<tr><td>${escapeHtml(day.date)}</td><td>${day.audits}</td><td>${day.logins}</td><td>${day.failures}</td><td>${day.ipEvents}</td></tr>`).join("") || '<tr><td colspan="5" class="empty">Sem atividade no período.</td></tr>';

      $("maintenanceStatus").textContent = maintenance.enabled ? "Ativa" : "Desativada";
      $("maintenanceStatus").classList.toggle("warning", Boolean(maintenance.enabled));
      $("maintenanceSummary").textContent = maintenance.enabled ? "O bloqueio está ativo. Perfis oficiais e liberados continuam acessíveis." : "O acesso público está liberado.";
    } catch (error) {
      $("apiStatus").textContent = "Falha";
      $("apiStatus").classList.add("warning");
      notify(error.message);
    }
  }
  async function loadProfiles() {
    const search = encodeURIComponent($("profileSearch").value.trim());
    try {
      const result = await api(`/api/admin/profiles?page=${page}&limit=25&search=${search}`);
      currentProfiles = result.profiles || [];
      totalPages = Math.max(1, Math.ceil(result.total / result.limit));
      $("profilesTable").innerHTML = currentProfiles.length ? currentProfiles.map((profile) => {
        const official = ["MT7QTEVMZY", "YGZNK6TMG8"].includes(profile.code);
        const status = profile.status || "active";
        return `<tr><td><input type="checkbox" class="profile-check" data-code="${escapeHtml(profile.code)}" ${official ? "disabled" : ""}></td><td><span class="code-cell">${escapeHtml(profile.code)}</span>${official ? '<span class="sub-cell">Perfil oficial · protegido</span>' : ""}</td><td>${formatBytes(profile.storage_bytes)}</td><td>${Number(profile.media_count || 0)}</td><td><span class="state ${escapeHtml(status)}">${status === "active" ? "Ativo" : status === "suspended" ? "Suspenso" : "Excluindo"}</span></td><td>${formatDate(profile.updated_at)}</td><td>${official ? '<span class="sub-cell">Proteção permanente</span>' : `<button type="button" class="quiet-button profile-reset" data-code="${escapeHtml(profile.code)}">Restaurar padrão</button>`}</td></tr>`;
      }).join("") : '<tr><td colspan="7" class="empty">Nenhum perfil encontrado.</td></tr>';
      $("profilesPageLabel").textContent = `Página ${page} de ${totalPages} · ${result.total} perfis`;
      $("previousPage").disabled = page <= 1;
      $("nextPage").disabled = page >= totalPages;
      $("selectAllProfiles").checked = false;
      updateSelection();
    } catch (error) { $("profilesTable").innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(error.message)}</td></tr>`; }
  }
  async function resetProfileFromControl(code) {
    const confirmed = window.confirm(`Restaurar ${code} ao padrão? Todas as personalizações e mídias serão removidas. VIP, cargos, tags e molduras concedidas serão preservados.`);
    if (!confirmed) return;
    const typed = window.prompt(`Para confirmar, digite RESTAURAR ${code}:`);
    if (typed !== `RESTAURAR ${code}`) { if (typed !== null) notify("Confirmação não corresponde. Nada foi alterado."); return; }
    const button = document.querySelector(`.profile-reset[data-code="${CSS.escape(code)}"]`);
    if (button) button.disabled = true;
    try {
      const result = await api(`/api/admin/profiles/${encodeURIComponent(code)}/reset`, { method: "POST", body: JSON.stringify({ confirmation: "RESTAURAR" }) });
      notify(`Perfil restaurado. ${Number(result.mediaRemoved || 0)} mídias removidas; benefícios preservados.`);
      await Promise.all([loadProfiles(), loadStorage(), loadOverview(true)]);
    } catch (error) { notify(error.message); if (button) button.disabled = false; }
  }

  function selectedCodes() { return [...document.querySelectorAll(".profile-check:checked")].map((input) => input.dataset.code); }
  function updateSelection() {
    const count = selectedCodes().length;
    $("selectionCount").textContent = count ? `${count} perfil(is) selecionado(s)` : "Nenhum perfil selecionado";
    ["suspendSelected", "activateSelected", "deleteSelected"].forEach((id) => $(id).disabled = count === 0);
  }
  async function changeSelectedStatus(status) {
    const codes = selectedCodes();
    if (!codes.length) return;
    const label = status === "suspended" ? "suspender" : "reativar";
    if (!confirm(`Deseja ${label} ${codes.length} perfil(is) selecionado(s)?`)) return;
    try {
      await api("/api/admin/profiles/status", { method: "PATCH", body: JSON.stringify({ codes, status }) });
      notify(`Perfis atualizados: ${codes.length}.`); await loadProfiles();
    } catch (error) { notify(error.message); }
  }
  async function deleteSelected() {
    const codes = selectedCodes();
    if (!codes.length) return;
    const ok = confirm(`ATENÇÃO: excluir permanentemente ${codes.length} perfil(is) e todas as mídias associadas? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    const confirmation = prompt('Para confirmar, digite EXCLUIR:');
    if (confirmation !== "EXCLUIR") { notify("Exclusão cancelada."); return; }
    $("deleteSelected").disabled = true;
    try {
      const result = await api("/api/admin/profiles", { method: "DELETE", body: JSON.stringify({ codes, confirmation }) });
      notify(`${result.deletedCount} perfil(is) excluído(s). ${formatBytes(result.releasedBytes)} liberados.`);
      await Promise.all([loadProfiles(), loadStorage(), loadOverview(true)]);
    } catch (error) { notify(error.message); await loadProfiles(); }
    finally { updateSelection(); }
  }
  async function loadStorage() {
    try {
      const data = await api("/api/admin/storage");
      $("storageUsed").textContent = formatBytes(data.totalBytes);
      $("storageCapacity").textContent = `de ${formatBytes(data.maxBytes)} disponíveis`;
      $("storagePercent").textContent = `${data.usagePercent.toFixed(1)}%`;
      $("storageBar").style.width = `${data.usagePercent}%`;
      $("storageRemaining").textContent = formatBytes(data.remainingBytes);
      $("storageProfiles").textContent = `${data.profileCount} / ${data.maxProfiles}`;
      $("storageEstimate").textContent = data.estimatedAdditionalProfilesByStorage == null ? "Sem média" : data.estimatedAdditionalProfilesByStorage;
      const drift = Number(data.counterDriftBytes || 0);
      $("storageIntegrity").textContent = drift === 0
        ? "Contadores íntegros. O total considera mídias registradas no D1; objetos órfãos no bucket não entram nesta métrica."
        : `Divergência detectada nos contadores internos: ${formatBytes(Math.abs(drift))}. O painel usa os metadados de mídia como referência.`;
      $("storageIntegrity").classList.toggle("warning", drift !== 0);
      const largest = data.largestProfiles || [];
      const max = Math.max(1, ...largest.map((x) => Number(x.storage_bytes || 0)));
      $("largestProfiles").innerHTML = largest.length ? largest.map((item) => `<div class="largest-item"><strong>${escapeHtml(item.code)}</strong><div class="bar"><span style="width:${Math.min(100, Number(item.storage_bytes || 0) / max * 100)}%"></span></div><span>${formatBytes(item.storage_bytes)}</span></div>`).join("") : '<p class="empty">Sem dados.</p>';
    } catch (error) { notify(error.message); }
  }
  async function loadMaintenance() {
    try {
      const data = await api("/api/admin/maintenance");
      $("maintenanceEnabled").checked = data.enabled === true;
      $("maintenanceTitle").value = data.title || "Em manutenção";
      $("maintenanceMessage").value = data.message || "Voltamos em breve.";
      maintenanceAllowedCodes = new Set(data.allowlist || []);
      maintenanceTextareaCodes = new Set(data.allowlist || []);
      $("maintenanceAllowlist").value = (data.allowlist || []).join("\n");
      await loadMaintenanceProfiles();
      $("maintenanceBackgroundType").value = data.backgroundType || "color";
      $("maintenanceBackgroundUrl").value = data.backgroundUrl && !data.backgroundUrl.startsWith("/api/") ? data.backgroundUrl : "";
      $("maintenanceAccent").value = data.accentColor || "#9b7add";
      $("maintenanceOverlay").value = data.overlayOpacity ?? 62;
      $("maintenanceBlur").value = data.blur ?? 0;
      updateMaintenancePreview(data.backgroundUrl || "", data.backgroundType || "color");
      updateMaintenanceRangeLabels();
      updateMaintenancePreviewText();
    } catch (error) { notify(error.message); }
  }
  async function loadMaintenanceProfiles() {
    const root = $("maintenanceProfileChoices"); if (!root) return;
    const search = encodeURIComponent($("maintenanceProfileSearch").value.trim());
    root.innerHTML = '<p class="empty">Carregando perfis...</p>';
    try {
      const data = await api(`/api/admin/profiles?page=1&limit=100&search=${search}`);
      const profiles = data.profiles || [];
      root.innerHTML = profiles.length ? profiles.map(profile => {
        const code = String(profile.code || "").toUpperCase();
        const official = ["MT7QTEVMZY", "YGZNK6TMG8"].includes(code.replace(/[^A-Z0-9]/g, ""));
        const checked = maintenanceAllowedCodes.has(code) || maintenanceAllowedCodes.has(code.replace(/[^A-Z0-9]/g, ""));
        return `<label class="maintenance-profile-choice"><input type="checkbox" data-maintenance-code="${escapeHtml(code)}" ${checked ? "checked" : ""} ${official ? "disabled" : ""}><span><strong>${escapeHtml(code)}</strong><small>${official ? "Perfil oficial · sempre protegido" : (profile.status === "suspended" ? "Suspenso" : "Perfil existente")}</small></span></label>`;
      }).join("") : '<p class="empty">Nenhum perfil encontrado.</p>';
    } catch (error) { root.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }
  async function saveMaintenance() {
    const allowlist = [...new Set([
      ...maintenanceAllowedCodes,
      ...$("maintenanceAllowlist").value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
      ...[...$("maintenanceProfileChoices").querySelectorAll("input[data-maintenance-code]:checked")].map(input => input.dataset.maintenanceCode)
    ])];
    try {
      const data = await api("/api/admin/maintenance", { method: "PATCH", body: JSON.stringify({
        enabled: $("maintenanceEnabled").checked,
        title: $("maintenanceTitle").value,
        message: $("maintenanceMessage").value,
        allowlist,
        backgroundType: $("maintenanceBackgroundType").value,
        backgroundUrl: $("maintenanceBackgroundUrl").value.trim(),
        overlayOpacity: Number($("maintenanceOverlay").value),
        blur: Number($("maintenanceBlur").value),
        accentColor: $("maintenanceAccent").value
      }) });
      maintenanceAllowedCodes = new Set(data.allowlist || allowlist);
      maintenanceTextareaCodes = new Set(data.allowlist || allowlist);
      $("maintenanceAllowlist").value = (data.allowlist || allowlist).join("\n");
      notify(data.enabled ? "Modo de manutenção ativado." : "Modo de manutenção desativado.");
      await loadOverview(true);
    } catch (error) { notify(error.message); }
  }
  function updateMaintenanceRangeLabels() {
    $("maintenanceOverlayValue").textContent = `${$("maintenanceOverlay").value}%`;
    $("maintenanceBlurValue").textContent = `${$("maintenanceBlur").value} px`;
  }
  function updateMaintenancePreview(url = $("maintenanceBackgroundUrl").value.trim(), type = $("maintenanceBackgroundType").value) {
    const preview = $("maintenancePreview");
    preview.querySelectorAll(".preview-media").forEach((node) => node.remove());
    if (url && type !== "color") {
      const media = type === "video" ? document.createElement("video") : document.createElement("img");
      media.className = "preview-media";
      media.src = url.startsWith("/") ? `${API}${url}` : url;
      if (type === "video") { media.autoplay = true; media.muted = true; media.loop = true; media.playsInline = true; }
      preview.prepend(media);
    }
    preview.style.setProperty("--preview-overlay", `${Number($("maintenanceOverlay").value) / 100}`);
    preview.style.setProperty("--preview-blur", `${Number($("maintenanceBlur").value)}px`);
    preview.style.setProperty("--preview-accent", $("maintenanceAccent").value);
  }
  function updateMaintenancePreviewText() {
    $("maintenancePreviewTitle").textContent = $("maintenanceTitle").value || "Em manutenção";
    $("maintenancePreviewMessage").textContent = $("maintenanceMessage").value || "Voltamos em breve.";
  }
  async function uploadMaintenanceBackground() {
    const file = $("maintenanceBackgroundFile").files?.[0];
    if (!file) { notify("Escolha uma imagem ou vídeo primeiro."); return; }
    if (file.size > 75 * 1024 * 1024) { notify("O arquivo ultrapassa o limite de 75 MB."); return; }
    const button = $("uploadMaintenanceBackground"); button.disabled = true; button.textContent = "Enviando…";
    try {
      const headers = new Headers({ "Content-Type": file.type, "X-File-Size": String(file.size) });
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(`${API}/api/admin/maintenance/media`, { method: "POST", headers, body: file, cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Falha HTTP ${response.status}`);
      $("maintenanceBackgroundType").value = result.backgroundType;
      $("maintenanceBackgroundUrl").value = result.backgroundUrl;
      updateMaintenancePreview(result.backgroundUrl, result.backgroundType);
      notify("Fundo enviado. Salve a configuração para aplicar.");
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; button.textContent = "Enviar fundo"; }
  }
  function parseAsset(value) { try { return JSON.parse(value || '{}') || {}; } catch { return {}; } }
  function readPngFile(file, limit) {
    return new Promise((resolve, reject) => {
      if (!file) { resolve(''); return; }
      if (file.type !== 'image/png' || file.size > limit) { reject(new Error(`Envie um PNG de até ${Math.round(limit / 1024)} KB.`)); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Não foi possível ler o PNG.'));
      reader.readAsDataURL(file);
    });
  }
  function effectValue(effect = {}) {
    const [key, value] = Object.entries(effect)[0] || ["", ""];
    return { key, value };
  }
  function effectValueLabel(effect = {}) {
    return Object.entries(effect).map(([key, value]) => {
      if (key === "profileStorageLimitBytes" && Number(value)) return `${Math.round(Number(value) / 1048576)} MB`;
      return `${key}: ${value}`;
    }).join(" · ") || "Sem efeito";
  }

  /* Identidade visual compartilhada com o Share: o mesmo emoji aparece no
     catálogo do Control e no perfil público, sem imagens ou rastreamento. */
  function emojiFor(item) {
    return window.HattzEmoji?.badge?.({
      id: item?.id,
      name: item?.name || item?.label,
      label: item?.label,
      category: item?.category,
      icon: item?.icon
    }) || "✦";
  }
  function setCount(id, value) { const el = $(id); if (el) el.textContent = String(value); }
  function updateRoleSummary() {
    setCount('roleTotalCount', ecosystemRoles.length);
    setCount('roleActiveCount', ecosystemRoles.filter(role => Number(role.enabled) !== 0).length);
    setCount('roleAssignmentCount', roleAssignmentRows.filter(row => row.kind === 'Cargo').length);
    setCount('roleStudioCount', studioRoleIds.size);
  }
  function updateBadgeSummary() {
    const active = ecosystemBadges.filter(badge => Number(badge.enabled) !== 0);
    setCount('badgeActiveCount', active.length);
    setCount('badgePublicCount', active.filter(badge => badge.is_public !== 0).length);
    setCount('badgeManualCount', active.filter(badge => badge.award_mode !== 'automatic').length);
    setCount('badgeCollectionCount', ecosystemCollections.filter(item => Number(item.enabled) !== 0).length);
  }
  function applyRolePreview() {
    const label = $('roleDefinitionLabel')?.value.trim() || 'Novo cargo';
    const id = $('roleDefinitionId')?.value.trim() || 'sem ID';
    const color = $('roleDefinitionColor')?.value || '#b99af0';
    const emoji = $('roleEmojiPreview'), name = $('rolePreviewName'), meta = $('rolePreviewMeta');
    if (emoji) { emoji.textContent = emojiFor({ id, label }); emoji.style.setProperty('--preview-accent', color); }
    if (name) { name.textContent = label; name.style.color = color; }
    if (meta) meta.textContent = `${id} · ${color}`;
  }
  function applyBadgePreview() {
    const name = $('catalogName')?.value.trim() || 'Nova insígnia';
    const id = $('catalogId')?.value.trim() || 'sem-id';
    const icon = $('catalogIcon')?.value.trim();
    const description = $('catalogDescription')?.value.trim();
    const category = $('catalogCategory')?.value.trim();
    const emoji = $('badgeEmojiPreview'), title = $('badgePreviewName'), meta = $('badgePreviewMeta');
    if (emoji) emoji.textContent = icon && /[^\x00-\x7F]/.test(icon) ? icon : emojiFor({ id, name, category, icon });
    if (title) title.textContent = name;
    if (meta) meta.textContent = description || 'Símbolo, nome e descrição aparecem aqui';
  }
  function filterList(rootId, needle, hintId) {
    const root = $(rootId);
    if (!root) return;
    const query = String(needle || '').trim().toLocaleLowerCase('pt-BR');
    let visible = 0;
    root.querySelectorAll('.searchable').forEach(row => {
      const text = (row.dataset.search || row.textContent || '').toLocaleLowerCase('pt-BR');
      const show = !query || text.includes(query);
      row.hidden = !show;
      if (show) visible++;
    });
    const hint = $(hintId);
    if (hint) hint.hidden = visible > 0 || !query;
  }
  function applyAllFilters() {
    filterList('roleDefinitionList', $('roleDefinitionSearch')?.value, 'roleSearchHint');
    filterList('roleAssignmentsList', $('roleAssignmentSearch')?.value, 'assignmentSearchHint');
    filterList('collectionList', $('collectionSearch')?.value, 'collectionSearchHint');
  }

  function renderCatalog() {
    const root = $('ecosystemCatalog');
    if (!root) return;
    const query = String($('catalogSearch')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const matches = catalogItems.filter(item => !query || item.term.includes(query));
    const shown = matches.slice(0, catalogVisible);
    root.innerHTML = shown.map(item => item.html).join('')
      || `<p class="empty">${query ? 'Nenhuma insígnia encontrada.' : 'Nenhuma insígnia cadastrada. Crie cada item manualmente.'}</p>`;
    root.querySelectorAll('[data-delete-catalog]').forEach(button => button.addEventListener('click', () => removeCatalogItem(button.dataset.catalogKind, button.dataset.deleteCatalog)));
    const count = $('catalogCount');
    if (count) count.textContent = query ? `${matches.length} encontrado(s)` : `${shown.length} de ${matches.length} itens`;
    const more = $('catalogMore');
    if (more) {
      more.hidden = shown.length >= matches.length;
      more.textContent = `Ver mais (${matches.length - shown.length})`;
    }
    const hint = $('catalogSearchHint');
    if (hint) hint.hidden = !query || matches.length > 0;
  }

  function renderBadgePurgeList() {
    const root = $('badgePurgeList');
    if (!root) return;
    const query = String($('badgePurgeSearch')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const badges = ecosystemBadges.filter(badge => !query || `${badge.id} ${badge.name || ''} ${badge.description || ''}`.toLocaleLowerCase('pt-BR').includes(query));
    root.innerHTML = badges.length ? badges.map(badge => `<div class="audit-item" data-search="${escapeHtml(`${badge.id} ${badge.name || ''} ${badge.description || ''}`)}"><span class="audit-time">INSÍGNIA</span><div><div class="audit-action"><span class="catalog-emoji">${emojiFor(badge)}</span> ${escapeHtml(badge.name)}</div><div class="audit-detail">${escapeHtml(badge.id)} · ${escapeHtml(badge.description || '')}${Number(badge.enabled) === 0 ? ' · Desativada' : ''}</div></div><button type="button" class="quiet-button danger-action" data-purge-badge="${escapeHtml(badge.id)}">Excluir</button></div>`).join('')
      : `<p class="empty">${query ? 'Nenhuma insígnia encontrada.' : 'Nenhuma insígnia cadastrada.'}</p>`;
    root.querySelectorAll('[data-purge-badge]').forEach(button => button.addEventListener('click', () => removeCatalogItem('badges', button.dataset.purgeBadge)));
    const count = $('badgePurgeCount');
    if (count) count.textContent = `${badges.length} insígnia(s)`;
    const hint = $('badgePurgeHint');
    if (hint) hint.hidden = !query || badges.length > 0;
  }

  /* Cada aba busca apenas o que usa. O catálogo é paginado para não transformar
     a lista publicada numa parede de 3000px. */
  async function ensureRoles() {
    if (rolesLoaded) return;
    try {
      const data = await api('/api/admin/roles');
      const roles = data.roles || [];
      ecosystemRoles = roles;
      const activeRoles = roles.filter(x => Number(x.enabled) !== 0);
      const roleOptions = activeRoles.map(x => `<option value="${escapeHtml(x.id)}">${emojiFor(x)} ${escapeHtml(x.label)}</option>`).join('') || '<option value="">Nenhum cargo disponível</option>';
      $('grantRoleId').innerHTML = roleOptions;
      $('frameRole').innerHTML = roleOptions;
      $('roleDefinitionList').innerHTML = roles.map(role => `<div class="role-definition-row searchable" data-search="${escapeHtml(`${role.id} ${role.label || ''} ${role.description || ''}`)}"><span class="role-preview-chip" style="--role-accent:${escapeHtml(role.color || '#b99af0')}"><span class="chip-emoji">${emojiFor(role)}</span> ${escapeHtml(role.label)}</span><span class="role-definition-meta">${escapeHtml(role.id)}${Number(role.enabled) === 0 ? ' · Desativado' : ''}${role.benefits && Object.keys(role.benefits).length ? ` · ${Object.keys(role.benefits).length} benefício(s)` : ''}</span><button type="button" class="quiet-button" data-edit-role="${escapeHtml(role.id)}">${Number(role.enabled) === 0 ? 'Editar / reativar' : 'Editar'}</button>${Number(role.enabled) !== 0 ? `<button type="button" class="quiet-button danger-action" data-delete-role="${escapeHtml(role.id)}">Desativar</button>` : ''}</div>`).join('') || '<p class="empty">Nenhum cargo cadastrado. Crie o primeiro acima.</p>';
      $('roleDefinitionList').querySelectorAll('[data-edit-role]').forEach(button => button.addEventListener('click', () => editRoleDefinition(roles.find(role => role.id === button.dataset.editRole))));
      $('roleDefinitionList').querySelectorAll('[data-delete-role]').forEach(button => button.addEventListener('click', () => removeRoleDefinition(button.dataset.deleteRole)));
      updateRoleSummary();
      applyRolePreview();
      filterList('roleDefinitionList', $('roleDefinitionSearch')?.value, 'roleSearchHint');
      rolesLoaded = true;
    } catch (error) { notify(error.message); }
  }

  /* A API não expõe catálogo de benefícios/coleções; manter estes renderizadores
     locais evita uma requisição 404 em cada visita ao Control. */
  async function ensureBenefits() {
    ecosystemBenefits = [];
    $('grantBenefitId').innerHTML = '<option value="">Nenhum benefício disponível</option>';
    renderBenefitList();
    renderRoleBenefitOptions();
  }

  async function ensureCatalog() {
    try {
      const data = await api('/api/admin/catalog');
      const frames = data.frames || [], badges = data.badges || [];
      ecosystemBadges = badges;
      ecosystemFrames = frames;
      $('grantBadgeId').innerHTML = badges.filter(x => Number(x.enabled) !== 0 && x.award_mode !== 'automatic').map(x => `<option value="${escapeHtml(x.id)}">${emojiFor(x)} ${escapeHtml(x.name)} · ${escapeHtml(x.rarityLabel || x.rarity)}</option>`).join('') || '<option value="">Nenhuma insígnia manual disponível</option>';
      $('collectionBadges').innerHTML = badges.filter(x => Number(x.enabled) !== 0).map(x => `<option value="${escapeHtml(x.id)}">${emojiFor(x)} ${escapeHtml(x.name)} · ${escapeHtml(x.rarityLabel || x.rarity)}</option>`).join('') || '<option value="">Nenhuma insígnia disponível</option>';
      $('grantFrameId').innerHTML = frames.filter(x => Number(x.enabled) !== 0).map(x => `<option value="${escapeHtml(x.id)}">🖼️ ${escapeHtml(x.name)} · ${escapeHtml(x.rarityLabel || x.rarity)}</option>`).join('') || '<option value="">Nenhuma moldura disponível</option>';
      catalogItems = badges.map(x => {
        const term = `${x.id} ${x.name || ''} ${x.category || ''} Insígnia`;
        const html = `<div class="audit-item searchable" data-search="${escapeHtml(term)}"><span class="audit-time">INSÍGNIA</span><div><div class="audit-action"><span class="catalog-emoji">${emojiFor(x)}</span> ${escapeHtml(x.name)}</div><div class="audit-detail">${escapeHtml(x.description || '')} · ${x.award_mode === 'automatic' ? 'Concessão automática' : 'Concessão manual'} · ${escapeHtml(x.color || '#B8BCC8')} · ${x.is_public === 0 ? 'Oculta' : 'Pública'}</div></div><span class="audit-target">${escapeHtml(x.rarityLabel || x.rarity)}${Number(x.enabled) === 0 ? ' · Desativada' : ''}</span><button type="button" class="quiet-button" data-edit-catalog="${escapeHtml(x.id)}" data-catalog-kind="badges" data-catalog-name="${escapeHtml(x.name)}" data-catalog-description="${escapeHtml(x.description || '')}" data-catalog-rarity="${Number(x.rarity_level || 1)}" data-catalog-category="${escapeHtml(x.category || '')}" data-catalog-public="${x.is_public === 0 ? '0' : '1'}" data-catalog-icon="${escapeHtml(x.icon || '')}">Editar</button><button type="button" class="quiet-button danger-action" data-delete-catalog="${escapeHtml(x.id)}" data-catalog-kind="badges">Excluir</button></div>`;
        return { term: term.toLocaleLowerCase('pt-BR'), html };
      });
      catalogVisible = CATALOG_PAGE;
      renderCatalog();
      renderFrameCatalog();
      renderBadgePurgeList();
      updateBadgeSummary();
      updateFrameSummary();
      applyBadgePreview();
    } catch (error) { notify(error.message); }
  }

  function renderFrameCatalog() {
    const root = $('frameCatalogList');
    if (!root) return;
    const query = String($('frameCatalogSearch')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const matches = ecosystemFrames.filter((frame) => !query || `${frame.id} ${frame.name || ''} ${frame.description || ''}`.toLocaleLowerCase('pt-BR').includes(query));
    root.innerHTML = matches.length ? matches.map((frame) => {
      const asset = parseAsset(frame.asset_json);
      const access = asset.accessMode || 'public';
      const term = `${frame.id} ${frame.name || ''} ${frame.description || ''} ${access}${asset.requiredRoleId ? ` ${asset.requiredRoleId}` : ''}`;
      const role = access === 'role' && asset.requiredRoleId ? ` · Cargo: ${escapeHtml(asset.requiredRoleId)}` : '';
      return `<div class="audit-item searchable" data-search="${escapeHtml(term)}"><span class="audit-time">MOLDURA</span><div><div class="audit-action"><span class="catalog-emoji">🖼️</span> ${escapeHtml(frame.name)}</div><div class="audit-detail">${escapeHtml(frame.description || '')} · Acesso: ${escapeHtml(access)}${role}</div></div><span class="audit-target">${escapeHtml(frame.rarityLabel || frame.rarity || '—')}${Number(frame.enabled) === 0 ? ' · Desativada' : ''}</span><button type="button" class="quiet-button" data-edit-frame="${escapeHtml(frame.id)}">Editar</button>${Number(frame.enabled) !== 0 ? `<button type="button" class="quiet-button danger-action" data-delete-frame="${escapeHtml(frame.id)}">Desativar</button>` : ''}</div>`;
    }).join('') : `<p class="empty">${query ? 'Nenhuma moldura encontrada.' : 'Nenhuma moldura cadastrada. Envie um PNG para começar.'}</p>`;
    root.querySelectorAll('[data-edit-frame]').forEach(button => button.addEventListener('click', () => editFrame(ecosystemFrames.find(frame => frame.id === button.dataset.editFrame))));
    root.querySelectorAll('[data-delete-frame]').forEach(button => button.addEventListener('click', () => removeCatalogItem('frames', button.dataset.deleteFrame)));
    const count = $('frameCatalogCount');
    if (count) count.textContent = query ? `${matches.length} encontrada(s)` : `${matches.length} moldura(s)`;
    const hint = $('frameCatalogHint');
    if (hint) hint.hidden = !query || matches.length > 0;
  }

  function updateFrameSummary() {
    const active = ecosystemFrames.filter((frame) => Number(frame.enabled) !== 0);
    const accessOf = (frame) => parseAsset(frame.asset_json).accessMode || 'public';
    setCount('frameActiveCount', active.length);
    setCount('framePublicCount', active.filter((frame) => accessOf(frame) === 'public').length);
    setCount('frameRestrictedCount', active.filter((frame) => ['vip', 'role'].includes(accessOf(frame))).length);
    setCount('frameGrantedCount', Number(dashboardCache?.ecosystem?.frames?.grants || 0));
  }

  async function ensureCollections() {
    ecosystemCollections = [];
    renderCollectionList();
    updateBadgeSummary();
    filterList('collectionList', $('collectionSearch')?.value, 'collectionSearchHint');
  }

  async function loadRolesView() {
    await Promise.all([ensureRoles(), ensureBenefits(), loadRoleAssignments(), loadStudioAccess()]);
  }

  async function loadBadgesView() {
    await Promise.all([ensureCatalog(), ensureRoles(), ensureCollections()]);
  }

  async function loadFramesView() {
    await Promise.all([ensureCatalog(), ensureRoles()]);
    await getDashboard(true);
    updateFrameSummary();
    syncFrameAccessFields();
  }

  async function loadEcosystem(force = false) {
    const [healthResult, dashboardResult] = await Promise.allSettled([
      api('/api/health', {}, false),
      getDashboard(force)
    ]);
    const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
    const data = dashboardResult.status === 'fulfilled' ? dashboardResult.value : null;
    const online = Boolean(health && String(health.status).toLowerCase() === 'ok');
    const pill = $('ecosystemApiPill');
    if (pill) {
      pill.textContent = online ? 'Operacional' : 'Indisponível';
      pill.classList.toggle('warning', !online);
    }
    setCount('ecosystemApiStatus', online ? 'Online' : 'Offline');
    $('ecosystemApiSummary').textContent = health
      ? `${health.service || 'hattz-share'} · health ${health.status || 'desconhecido'}${data ? ` · ${data.security?.activeSessions ?? 0} sessão(ões) administrativa(s) ativa(s)` : ''}.`
      : 'Não foi possível consultar /api/health. Os demais dados abaixo vêm do painel administrativo.';
    $('ecosystemApiTable').innerHTML = [
      ['Health', health?.status || 'Sem resposta'],
      ['Serviço', health?.service || '—'],
      ['Sessões administrativas', data?.security?.activeSessions ?? '—'],
      ['Manutenção global', data?.security?.maintenance?.enabled ? 'Ativa' : 'Desativada'],
      ['Tentativas bloqueadas', data?.security?.blockedLoginAttempts ?? 0]
    ].map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`).join('');

    const profiles = data?.profiles || {};
    const ecosystem = data?.ecosystem || {};
    const catalogRows = ecosystem.catalog || [];
    const activeKind = (kind) => catalogRows.filter((row) => row.kind === kind && row.enabled).length;
    setCount('ecosystemProfileTotal', profiles.total ?? '—');
    setCount('ecosystemBadgeTotal', ecosystem.badges?.enabled ?? activeKind('Insígnia'));
    setCount('ecosystemFrameTotal', ecosystem.frames?.enabled ?? activeKind('Moldura'));
    $('ecosystemProfileSummary').textContent = profiles.total == null
      ? 'Resumo de perfis indisponível.'
      : `${profiles.active || 0} ativos · ${profiles.suspended || 0} suspensos · ${profiles.official || 0} oficiais · ${profiles.vip || 0} VIP.`;
    $('ecosystemProfileTable').innerHTML = [...(profiles.byStatus || []), { label: 'Com VIP', value: profiles.vip || 0 }]
      .map((row) => `<tr><td>${escapeHtml(row.label)}</td><td><strong>${escapeHtml(row.value ?? 0)}</strong></td></tr>`).join('')
      || '<tr><td colspan="2" class="empty">Sem dados de perfis.</td></tr>';
    $('ecosystemCatalogSummaryTable').innerHTML = catalogRows.length ? catalogRows.map((row) => `<tr><td>${escapeHtml(row.kind)}</td><td><strong>${Number(row.enabled) ? 'Ativo' : 'Desativado'}</strong><span class="sub-cell">${escapeHtml(row.name || row.id || '')}</span></td><td>${Number(row.grants) || 0}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty">Sem itens publicados.</td></tr>';
    await ensureBenefits();
    if (dashboardResult.status === 'rejected') notify(dashboardResult.reason.message);
  }

  function openPreview(sourceId) {
    const code = codeFrom(sourceId);
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) {
      notify('Informe um código de perfil válido para ver a prévia publicada.');
      return;
    }
    const url = new URL('index.html', window.location.href);
    url.searchParams.set('share', code);
    previewUrl = url.toString();
    $('previewFrame').src = previewUrl;
    $('previewSubtitle').textContent = `Perfil ${code} · Share público, sem login.`;
    $('previewModal').hidden = false;
    $('previewClose').focus();
  }
  function closePreview() {
    $('previewModal').hidden = true;
    $('previewFrame').src = 'about:blank';
    previewUrl = '';
  }

  function renderCollectionList() {
    const root = $('collectionList');
    if (!root) return;
    root.innerHTML = ecosystemCollections.length ? ecosystemCollections.map(collection => `<div class="audit-item searchable" data-search="${escapeHtml(`${collection.id} ${collection.name || ''} ${collection.description || ''}`)}"><span class="audit-time">CONJUNTO</span><div><div class="audit-action">${escapeHtml(collection.name)}</div><div class="audit-detail">${escapeHtml(collection.description || '')} · ${(collection.badges || []).length} insígnia(s) · ${escapeHtml(effectValueLabel(collection.reward))}</div></div><span class="audit-target">${Number(collection.enabled) === 0 ? 'Desativada' : 'Ativa'}</span><button type="button" class="quiet-button" data-edit-collection="${escapeHtml(collection.id)}">Editar</button>${Number(collection.enabled) !== 0 ? `<button type="button" class="quiet-button danger-action" data-delete-collection="${escapeHtml(collection.id)}">Desativar</button>` : ''}</div>`).join('') : '<p class="empty">Nenhuma coleção cadastrada.</p>';
    root.querySelectorAll('[data-edit-collection]').forEach(button => button.addEventListener('click', () => editCollection(ecosystemCollections.find(item => item.id === button.dataset.editCollection))));
    root.querySelectorAll('[data-delete-collection]').forEach(button => button.addEventListener('click', () => removeCollection(button.dataset.deleteCollection)));
  }
  function editCollection(collection) {
    if (!collection) return;
    $('collectionId').value = collection.id;
    $('collectionId').readOnly = true;
    $('collectionName').value = collection.name || '';
    $('collectionDescription').value = collection.description || '';
    $('collectionRewardTitle').value = collection.reward?.title || '';
    const selected = new Set(collection.badges || []);
    [...$('collectionBadges').options].forEach(option => { option.selected = selected.has(option.value); });
    $('collectionName').focus();
  }
  function resetCollectionForm() {
    $('collectionId').value = '';
    $('collectionId').readOnly = false;
    $('collectionName').value = '';
    $('collectionDescription').value = '';
    $('collectionRewardTitle').value = '';
    [...$('collectionBadges').options].forEach(option => { option.selected = false; });
  }
  async function saveCollection() {
    const id = $('collectionId').value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) { notify('Use um ID de 2 a 48 caracteres para a coleção.'); return; }
    const badges = [...$('collectionBadges').selectedOptions].map(option => option.value);
    if (!badges.length) { notify('Selecione ao menos uma insígnia para o conjunto.'); return; }
    const title = $('collectionRewardTitle').value.trim();
    const body = { name: $('collectionName').value.trim(), description: $('collectionDescription').value.trim(), badges, reward: title ? { title } : {} };
    if (!body.name) { notify('Informe o nome da coleção.'); return; }
    try {
      await api(`/api/admin/collections/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
      notify('Coleção salva.');
      resetCollectionForm();
      await ensureCollections();
    } catch (error) { notify(error.message); }
  }
  async function removeCollection(id) {
    if (!id || !window.confirm(`Desativar a coleção "${id}"? As conquistas já concedidas serão preservadas.`)) return;
    try { await api(`/api/admin/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }); notify('Coleção desativada. Conquistas preservadas.'); await ensureCollections(); }
    catch (error) { notify(error.message); }
  }

  function renderBenefitList() {
    const root = $('benefitList');
    if (!root) return;
    root.innerHTML = ecosystemBenefits.length ? ecosystemBenefits.map(benefit => `<div class="audit-item"><span class="audit-time">BENEFÍCIO</span><div><div class="audit-action">${escapeHtml(benefit.name)}</div><div class="audit-detail">${escapeHtml(benefit.description || '')} · ${escapeHtml(effectValueLabel(benefit.effect))}</div></div><span class="audit-target">${Number(benefit.enabled) === 0 ? 'Desativado' : 'Ativo'}</span><button type="button" class="quiet-button" data-edit-benefit="${escapeHtml(benefit.id)}">Editar</button>${Number(benefit.enabled) !== 0 ? `<button type="button" class="quiet-button danger-action" data-delete-benefit="${escapeHtml(benefit.id)}">Desativar</button>` : ''}</div>`).join('') : '<p class="empty">Nenhum benefício cadastrado.</p>';
    root.querySelectorAll('[data-edit-benefit]').forEach(button => button.addEventListener('click', () => editBenefit(ecosystemBenefits.find(item => item.id === button.dataset.editBenefit))));
    root.querySelectorAll('[data-delete-benefit]').forEach(button => button.addEventListener('click', () => removeBenefit(button.dataset.deleteBenefit)));
  }
  function editBenefit(benefit) {
    if (!benefit) return;
    $('benefitId').value = benefit.id;
    $('benefitId').readOnly = true;
    $('benefitName').value = benefit.name || '';
    $('benefitDescription').value = benefit.description || '';
    const { key, value } = effectValue(benefit.effect);
    if (key) $('benefitEffect').value = key;
    $('benefitValue').value = value == null ? '' : String(value);
    $('benefitName').focus();
  }
  function resetBenefitForm() {
    $('benefitId').value = '';
    $('benefitId').readOnly = false;
    $('benefitName').value = '';
    $('benefitDescription').value = '';
    $('benefitEffect').value = 'profileStorageLimitBytes';
    $('benefitValue').value = '';
  }
  function buildEffect() {
    const key = $('benefitEffect').value;
    const raw = $('benefitValue').value.trim();
    if (!raw) throw new Error('Informe o valor do benefício.');
    if (key === 'profileStorageLimitBytes' || key === 'badgeSlots') {
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Use um número inteiro positivo para este efeito.');
      return { [key]: value };
    }
    if (key === 'prioritySupport') return { prioritySupport: /^(true|sim|1)$/i.test(raw) };
    return { [key]: raw.slice(0, 120) };
  }
  async function saveBenefit() {
    const id = $('benefitId').value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) { notify('Use um ID de 2 a 48 caracteres para o benefício.'); return; }
    try {
      const body = { name: $('benefitName').value.trim(), description: $('benefitDescription').value.trim(), effect: buildEffect() };
      if (!body.name) { notify('Informe o nome do benefício.'); return; }
      await api(`/api/admin/benefits/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
      notify('Benefício salvo.');
      resetBenefitForm();
      await ensureBenefits();
    } catch (error) { notify(error.message); }
  }
  async function removeBenefit(id) {
    if (!id || !window.confirm(`Desativar o benefício "${id}"? Concessões existentes serão preservadas.`)) return;
    try { await api(`/api/admin/benefits/${encodeURIComponent(id)}`, { method: 'DELETE' }); notify('Benefício desativado. Concessões preservadas.'); await ensureBenefits(); }
    catch (error) { notify(error.message); }
  }
  function renderRoleBenefitOptions() {
    const root = $('roleBenefitOptions');
    if (!root) return;
    root.innerHTML = ecosystemBenefits.length ? ecosystemBenefits.map(benefit => `<label class="role-access-option"><input type="checkbox" value="${escapeHtml(benefit.id)}" data-role-benefit><span>${escapeHtml(benefit.name)}</span><small>${escapeHtml(effectValueLabel(benefit.effect))}</small></label>`).join('') : '<p class="empty">Cadastre um benefício para herdá-lo por cargo.</p>';
  }
  async function mutateProfileBenefit(action) {
    const code = entitlementCode();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) { notify('Informe um código de perfil válido.'); return; }
    const benefitId = $('grantBenefitId').value;
    if (!benefitId) { notify('Cadastre ou selecione um benefício primeiro.'); return; }
    try {
      await api(`/api/admin/profiles/${code}/benefits`, { method: 'POST', body: JSON.stringify({ benefitId, action }) });
      notify(`Benefício ${action === 'grant' ? 'concedido' : 'revogado'}.`);
      await loadProfileBadges();
    } catch (error) { notify(error.message); }
  }
  async function loadRoleAssignments() {
    try {
      const data = await api('/api/admin/role-assignments');
      const assignments = [
        ...(data.assignments || []).map(item => ({ ...item, kind: 'Cargo', label: item.roleLabel, valid: item.expiresAt ? `Até ${formatDate(item.expiresAt)}` : 'Permanente' })),
        ...(data.tagAssignments || []).map(item => ({ ...item, kind: 'Tag', label: item.tagLabel, valid: 'Atribuída' }))
      ];
      roleAssignmentRows = assignments;
      $('roleAssignmentsList').innerHTML = assignments.length
        ? assignments.map(item => `<div class="audit-item searchable" data-search="${escapeHtml(`${item.kind} ${item.label || ''} ${item.profileName || ''} ${item.profileCode || ''}`)}"><span class="audit-time">${escapeHtml(item.kind)}</span><div><div class="audit-action"><span class="catalog-emoji">${emojiFor(item)}</span> ${escapeHtml(item.label)}</div><div class="audit-detail">${escapeHtml(item.profileName)}${item.username ? ` · @${escapeHtml(item.username)}` : ''} · ${escapeHtml(item.profileCode)}</div></div><span class="audit-target">${escapeHtml(item.valid)}</span></div>`).join('')
        : '<p class="empty">Nenhum perfil recebeu cargos ou insígnias ainda.</p>';
      filterList('roleAssignmentsList', $('roleAssignmentSearch')?.value, 'assignmentSearchHint');
    } catch (error) { $('roleAssignmentsList').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }
  const ROLE_THEME_FIELDS = { background: 'roleThemeBackground', gradient: 'roleThemeGradient', card: 'roleThemeCard', accent: 'roleThemeAccent', text: 'roleThemeText', border: 'roleThemeBorder' };
  const SERVER_ROLE_PRESETS = {
    booster: {
      label: 'Booster', color: '#FF73FA', description: 'Impulsiona o servidor e desbloqueia benefícios de apoio.',
      theme: { background: '#120b16', gradient: '#4a214f', card: '#1c1424', accent: '#ff9bf8', text: '#fdf3ff', border: '#5b2a61' }
    },
    veteran: {
      label: 'Veterano', color: '#F0B232', description: 'Presente desde os primeiros dias da comunidade.',
      theme: { background: '#120f09', gradient: '#4d3a17', card: '#1d1810', accent: '#f7c968', text: '#fff7e6', border: '#5b461f' }
    },
    contributor: {
      label: 'Colaborador', color: '#5865F2', description: 'Contribui com ideias, código ou organização da comunidade.',
      theme: { background: '#0b0a10', gradient: '#292333', card: '#14121b', accent: '#a78bfa', text: '#f4f0fa', border: '#302a3a' }
    },
    partner: {
      label: 'Parceiro', color: '#FAA61A', description: 'Parceiro reconhecido do Hättz.',
      theme: { background: '#130d08', gradient: '#52300f', card: '#1f1710', accent: '#ffc46b', text: '#fff4e6', border: '#63411d' }
    }
  };
  const SERVER_BADGE_PRESETS = {
    owner: { name: 'Owner', description: 'Insígnia reservada aos perfis oficiais do Hättz.', category: 'server', rarity: '5', icon: '👑' },
    vip: { name: 'VIP', description: 'Apoio premium ao ecossistema Hättz.', category: 'server', rarity: '4', icon: '💎' },
    apoiador: { name: 'Apoiador', description: 'Quem apoia ativamente a comunidade Hättz.', category: 'server', rarity: '2', icon: '🤝' }
  };
  function applyRolePreset(id) {
    const preset = SERVER_ROLE_PRESETS[id];
    if (!preset) return;
    resetRoleDefinition();
    $('roleDefinitionId').value = id;
    $('roleDefinitionLabel').value = preset.label;
    $('roleDefinitionDescription').value = preset.description;
    $('roleDefinitionColor').value = preset.color;
    Object.entries(ROLE_THEME_FIELDS).forEach(([key, field]) => { $(field).value = preset.theme[key] || '#0b0a10'; });
    $('roleDefinitionLabel').focus();
    applyRolePreview();
    notify(`Modelo “${preset.label}” carregado.`);
  }
  function applyBadgePreset(id) {
    const preset = SERVER_BADGE_PRESETS[id];
    if (!preset) return;
    $('catalogId').value = id;
    $('catalogName').value = preset.name;
    $('catalogDescription').value = preset.description;
    $('catalogRarity').value = preset.rarity;
    $('catalogCategory').value = preset.category;
    $('catalogIcon').value = preset.icon;
    $('catalogIsPublic').checked = true;
    $('catalogName').focus();
    applyBadgePreview();
    notify(`Modelo “${preset.name}” carregado.`);
  }
  function editRoleDefinition(role) {
    if (!role) return;
    $('roleDefinitionId').value = role.id;
    $('roleDefinitionId').dataset.originalId = role.id;
    $('roleDefinitionLabel').value = role.label || '';
    $('roleDefinitionDescription').value = role.description || '';
    $('roleDefinitionColor').value = /^#[0-9a-f]{6}$/i.test(role.color || '') ? role.color : '#b99af0';
    Object.entries(ROLE_THEME_FIELDS).forEach(([key, id]) => { const value = role.theme?.[key]; $(id).value = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#0b0a10'; });
    const currentBenefits = role.benefits || {};
    $('roleBenefitOptions').querySelectorAll('[data-role-benefit]').forEach(input => {
      const benefit = ecosystemBenefits.find(item => item.id === input.value);
      const effect = benefit?.effect || {};
      input.checked = Object.keys(effect).length > 0 && Object.entries(effect).every(([key, value]) => currentBenefits[key] === value);
    });
    $('saveRoleDefinition').textContent = 'Atualizar cargo';
    $('roleDefinitionId').readOnly = true;
    $('roleDefinitionLabel').focus();
    applyRolePreview();
  }
  function resetRoleDefinition() {
    ['roleDefinitionId','roleDefinitionLabel','roleDefinitionDescription'].forEach(id => $(id).value = '');
    delete $('roleDefinitionId').dataset.originalId;
    $('roleDefinitionId').readOnly = false;
    $('roleDefinitionColor').value = '#b99af0';
    $('roleBenefitOptions').querySelectorAll('[data-role-benefit]').forEach(input => { input.checked = false; });
    Object.values(ROLE_THEME_FIELDS).forEach((id, index) => { $(id).value = ['#0b0a10','#292333','#14121b','#a78bfa','#f4f0fa','#302a3a'][index]; });
    $('saveRoleDefinition').textContent = 'Salvar cargo especial';
    applyRolePreview();
  }
  async function saveRoleDefinition() {
    const id = $('roleDefinitionId').value.trim().toLowerCase();
    const benefits = {};
    for (const input of $('roleBenefitOptions').querySelectorAll('[data-role-benefit]:checked')) {
      const benefit = ecosystemBenefits.find(item => item.id === input.value);
      if (benefit?.effect) Object.assign(benefits, benefit.effect);
    }
    const body = { id, label: $('roleDefinitionLabel').value.trim(), description: $('roleDefinitionDescription').value.trim(), color: $('roleDefinitionColor').value, theme: Object.fromEntries(Object.entries(ROLE_THEME_FIELDS).map(([key, field]) => [key, $(field).value])), benefits };
    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) { notify('Use um ID de 2 a 48 caracteres, sem espaços.'); return; }
    if (!body.label) { notify('Informe o nome do cargo.'); return; }
    try {
      const editing = Boolean($('roleDefinitionId').dataset.originalId);
      await api(editing ? `/api/admin/roles/${encodeURIComponent(id)}` : '/api/admin/roles', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
      notify(editing ? 'Cargo e tema atualizados.' : 'Cargo especial criado.');
      resetRoleDefinition();
      rolesLoaded = false;
      await ensureRoles();
    } catch (error) { notify(error.message); }
  }

  async function loadStudioAccess() {
    try {
      const data = await api('/api/admin/studio-access');
      const selected = new Set(data.roleIds || []);
      studioRoleIds = selected;
      $('studioAccessRoles').innerHTML = (data.roles || []).map(role => `<label class="role-access-option"><input type="checkbox" value="${escapeHtml(role.id)}" ${selected.has(role.id)?'checked':''}><span>${emojiFor(role)} ${escapeHtml(role.label)}</span><small>${escapeHtml(role.id)}</small></label>`).join('') || '<p class="empty">Crie cargos antes de configurar o acesso.</p>';
    } catch(error) { $('studioAccessRoles').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }
  async function saveStudioAccess() {
    const roleIds = [...$('studioAccessRoles').querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value);
    try { await api('/api/admin/studio-access',{method:'PUT',body:JSON.stringify({roleIds})}); studioRoleIds = new Set(roleIds); updateRoleSummary(); notify('Permissões do editor do Studio atualizadas.'); }
    catch(error) { notify(error.message); }
  }

  function syncFrameAccessFields() {
    const field = $('frameRoleField');
    if (!field) return;
    field.hidden = ($('frameAccess')?.value || 'public') !== 'role';
  }
  async function saveCatalogItem() {
    const id = $('catalogId').value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) { notify('Use um ID de 2 a 48 caracteres: letras, números, hífen ou sublinhado.'); return; }
    const body = {
      name: $('catalogName').value,
      description: $('catalogDescription').value,
      rarityLevel: Number($('catalogRarity')?.value || 1),
      isPublic: $('catalogIsPublic')?.checked !== false,
      awardMode: 'manual'
    };
    try {
      body.category = $('catalogCategory').value;
      body.icon = await readPngFile($('catalogIconFile').files?.[0], 128 * 1024) || $('catalogIcon').value || '✦';
    } catch (error) { notify(error.message); return; }
    try {
      await api(`/api/admin/catalog/badges/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
      notify('Insígnia salva no catálogo.');
      await ensureCatalog();
    } catch (error) { notify(error.message); }
  }

  function resetFrameForm() {
    ['frameId', 'frameName', 'frameDescription'].forEach((id) => { $(id).value = ''; });
    $('frameId').readOnly = false;
    $('frameFile').value = '';
    $('frameAccess').value = 'public';
    $('frameRole').value = '';
    $('frameRarity').value = '1';
    $('frameScale').value = '100';
    $('frameX').value = '0';
    $('frameY').value = '0';
    syncFrameAccessFields();
    $('frameId').focus();
  }
  function editFrame(frame) {
    if (!frame) return;
    const asset = parseAsset(frame.asset_json);
    $('frameId').value = frame.id;
    $('frameId').readOnly = true;
    $('frameName').value = frame.name || '';
    $('frameDescription').value = frame.description || '';
    $('frameFile').value = '';
    $('frameAccess').value = ['vip', 'role'].includes(asset.accessMode) ? asset.accessMode : 'public';
    $('frameRole').value = asset.requiredRoleId || '';
    $('frameRarity').value = String(frame.rarity_level || 1);
    $('frameScale').value = String(asset.scale || 100);
    $('frameX').value = String(asset.x || 0);
    $('frameY').value = String(asset.y || 0);
    syncFrameAccessFields();
    $('frameName').focus();
    notify('Moldura carregada. Envie um novo PNG apenas se quiser substituir a imagem.');
  }
  async function saveFrame() {
    const id = $('frameId').value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) { notify('Use um ID de 2 a 48 caracteres: letras, números, hífen ou sublinhado.'); return; }
    const name = $('frameName').value.trim();
    if (!name) { notify('Informe o nome da moldura.'); return; }
    const accessMode = $('frameAccess').value;
    const requiredRoleId = accessMode === 'role' ? $('frameRole').value : '';
    if (accessMode === 'role' && !requiredRoleId) { notify('Selecione o cargo exigido por esta moldura.'); return; }
    let imageData;
    try { imageData = await readPngFile($('frameFile').files?.[0], 300 * 1024); }
    catch (error) { notify(error.message); return; }
    const body = {
      name,
      description: $('frameDescription').value,
      rarityLevel: Number($('frameRarity').value || 1),
      accessMode,
      requiredRoleId,
      asset: {
        imageData,
        scale: Number($('frameScale').value),
        x: Number($('frameX').value),
        y: Number($('frameY').value)
      }
    };
    try {
      await api(`/api/admin/catalog/frames/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
      notify('Moldura salva no catálogo.');
      await ensureCatalog();
      await getDashboard(true);
      updateFrameSummary();
      resetFrameForm();
    } catch (error) { notify(error.message); }
  }
  async function loadFrameProfile(codeOverride) {
    const code = codeOverride || frameProfileCode();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) { notify('Informe um código de perfil válido no campo de Molduras.'); return; }
    try {
      const data = await api(`/api/admin/profiles/${code}/frames`);
      const frames = data.frames || [];
      $('frameProfileList').innerHTML = frames.length
        ? frames.map((frame) => `<div class="role-row"><strong>🖼️ ${escapeHtml(frame.name)}</strong><span>${escapeHtml(frame.id)} · ${formatDate(frame.awarded_at)}</span></div>`).join('')
        : '<p class="empty">Este perfil não possui molduras concedidas.</p>';
    } catch (error) { $('frameProfileList').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }
  async function removeRoleDefinition(id) {
    if (!id || !window.confirm(`Desativar o cargo "${id}"? As atribuições serão preservadas e voltarão a valer se o cargo for reativado.`)) return;
    try {
      await api(`/api/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      notify('Cargo desativado. As atribuições foram preservadas.');
      resetRoleDefinition();
      rolesLoaded = false;
      await Promise.all([ensureRoles(), loadRoleAssignments()]);
    } catch (error) { notify(error.message); }
  }
  async function removeCatalogItem(kind, id) {
    const permanent = kind === 'badges';
    const question = permanent
      ? `Excluir a insígnia "${id}" permanentemente? Todas as concessões serão removidas e esta ação não pode ser desfeita.`
      : `Desativar "${id}"? As concessões históricas serão preservadas e voltarão a aparecer se o item for reativado.`;
    if (!id || !window.confirm(question)) return;
    const path = permanent
      ? `/api/admin/catalog/${kind}/${encodeURIComponent(id)}/permanent`
      : `/api/admin/catalog/${kind}/${encodeURIComponent(id)}`;
    try {
      const result = await api(path, { method: 'DELETE' });
      notify(permanent ? `Insígnia "${id}" excluída. ${Number(result.grantsRemoved || 0)} concessão(ões) removida(s).` : 'Item desativado. As concessões foram preservadas.');
      await ensureCatalog();
    } catch (error) { notify(error.message); }
  }
  function codeFrom(fieldId) {
    const field = $(fieldId);
    const raw = field ? field.value.trim().toUpperCase() : '';
    return raw.replace(/^HTZ-?/, '').replace(/-/g, '');
  }
  /* Cada área tem seu próprio campo de perfil; o campo da área visível tem
     prioridade, mas o outro serve como atalho quando o administrador já
     informou o código antes de trocar de seção. */
  function entitlementCode() { return codeFrom('entitlementCode') || codeFrom('badgeProfileCode') || codeFrom('frameProfileCode'); }
  function badgeProfileCode() { return codeFrom('badgeProfileCode') || codeFrom('entitlementCode') || codeFrom('frameProfileCode'); }
  function frameProfileCode() { return codeFrom('frameProfileCode') || codeFrom('badgeProfileCode') || codeFrom('entitlementCode'); }
  async function saveVip() {
    const code=entitlementCode(); if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)){notify('Informe um código de perfil válido.');return;}
    const enabled=$('vipEnabled').value==='true';
    const expiry=$('vipExpiry').value;
    const expiryMs=expiry ? new Date(expiry).getTime() : null;
    if (enabled && expiry && (!Number.isFinite(expiryMs) || expiryMs <= Date.now())) { notify('A validade do VIP precisa ser uma data futura válida.'); return; }
    const body={vip:enabled,vipExpiresAt:enabled ? expiryMs : null,benefits:{profileStorageLimitBytes:524288000}};
    try { const result=await api(`/api/admin/profiles/${code}/entitlements`,{method:'PUT',body:JSON.stringify(body)}); await Promise.all([loadProfileRoles(), loadProfileBadges(code)]); notify(result.vip?'VIP concedido.':'VIP revogado.'); }
    catch(error){notify(error.message);}
  }
  async function mutateProfileCollectible(type, action) {
    const isBadge = type === 'badges';
    const code = isBadge ? badgeProfileCode() : frameProfileCode();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) { notify(`Informe um código de perfil válido no campo de ${isBadge ? 'Insígnias' : 'Molduras'}.`); return; }
    const id = $(isBadge ? 'grantBadgeId' : 'grantFrameId').value;
    if (!id) { notify('Cadastre ou selecione um item primeiro.'); return; }
    const body = isBadge ? { badgeId: id, action } : { frameId: id, action };
    try {
      await api(`/api/admin/profiles/${code}/${type}`, { method: 'POST', body: JSON.stringify(body) });
      notify(`${isBadge ? 'Insígnia' : 'Moldura'} ${action === 'grant' ? 'concedida' : 'revogada'}.`);
      if (isBadge) await Promise.all([loadProfileBadges(), loadRoleAssignments()]);
      else {
        await loadFrameProfile();
        await getDashboard(true);
        updateFrameSummary();
      }
    } catch (error) { notify(error.message); }
  }

  async function mutateProfileRole(action) {
    const code = entitlementCode();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) { notify('Informe um código de perfil válido.'); return; }
    const roleId = $('grantRoleId').value;
    if (!roleId) { notify('Selecione um cargo.'); return; }
    const expiry = $('roleExpiry').value;
    const expiresAt = expiry ? new Date(expiry).getTime() : null;
    if (action === 'grant' && expiry && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) { notify('A validade do cargo precisa ser futura.'); return; }
    try {
      await api(`/api/admin/profiles/${code}/roles`, { method: 'POST', body: JSON.stringify({ roleId, action, expiresAt: action === 'grant' ? expiresAt : null }) });
      notify(action === 'grant' ? 'Cargo concedido.' : 'Cargo revogado.');
      await Promise.all([loadProfileRoles(), loadRoleAssignments()]);
    } catch (error) { notify(error.message); }
  }
  async function loadProfileRoles() {
    const code = entitlementCode();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) { notify('Informe um código de perfil válido.'); return; }
    try {
      const data = await api(`/api/admin/profiles/${code}/roles`);
      $('profileRoleList').innerHTML = (data.roles || []).length
        ? data.roles.map(role => `<div class="role-row"><strong><span class="role-preview-chip" style="--role-accent:${escapeHtml(role.color || '#b99af0')}">${escapeHtml(role.label)}</span></strong><span>${role.expires_at ? `Até ${formatDate(role.expires_at)}` : 'Sem validade'}</span></div>`).join('')
        : '<p class="empty">Este perfil não possui cargos concedidos.</p>';
    } catch (error) { $('profileRoleList').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }

  async function loadProfileBadges(codeOverride) {
    const code = codeOverride || badgeProfileCode();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) { notify('Informe um código de perfil válido no campo de Insígnias.'); return; }
    try {
      const [badgeData, frameData, benefitData] = await Promise.all([
        api(`/api/admin/profiles/${code}/badges`),
        api(`/api/admin/profiles/${code}/frames`),
        api(`/api/admin/profiles/${code}/benefits`)
      ]);
      const items = [
        ...(badgeData.badges || []).map(item => ({ kind: 'Insígnia', ...item })),
        ...(frameData.frames || []).map(item => ({ kind: 'Moldura', ...item })),
        ...(benefitData.benefits || []).map(item => ({ kind: 'Benefício', name: item.name, id: item.id, detail: effectValueLabel(item.effect) }))
      ];
      $('profileBadgeList').innerHTML = items.length
        ? items.map(item => `<div class="role-row"><strong>${escapeHtml(item.kind)} · ${escapeHtml(item.name)}</strong><span>${escapeHtml(item.detail || item.id)}</span></div>`).join('')
        : '<p class="empty">Este perfil não possui insígnias, molduras ou benefícios diretos atribuídos.</p>';
    } catch (error) { $('profileBadgeList').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }

  async function loadIp() {
    const profile = encodeURIComponent($("ipProfileFilter").value.trim());
    const reloadButton = $("reloadIp");
    if (reloadButton) { reloadButton.disabled = true; reloadButton.textContent = "Atualizando…"; }
    try {
      const data = await api(`/api/admin/ip-events?limit=100${profile ? `&profile=${profile}` : ""}`);
      const providerState = data.reputationProviderEnabled ? "IPQualityScore ativo apenas para eventos de segurança." : "IPQualityScore desativado; VPN/proxy/Tor ficam sem classificação externa.";
      $("vpnProviderStatus").textContent = `Exibindo ${data.events.length} IPs únicos por perfil. Localização aproximada via Cloudflare · retenção de ${data.retentionDays || 90} dias. ${providerState}`;
      $("ipTable").innerHTML = data.events.length ? data.events.map((event) => {
        const location = [event.city, event.region, event.country].filter(Boolean).join(", ") || "Localização aproximada indisponível";
        const isp = [event.as_org, event.asn ? `ASN ${event.asn}` : ""].filter(Boolean).join(" · ") || "—";
        const risk = [event.vpn === 1 ? "VPN" : "", event.proxy === 1 ? "Proxy" : "", event.tor === 1 ? "Tor" : ""].filter(Boolean).join(" · ") || "Sem sinal confirmado";
        const client = event.client || {};
        const activity = `${Number(event.event_count || 1)} evento(s)<span class="sub-cell">Primeiro: ${escapeHtml(formatDate(event.first_seen || event.created_at))}<br>Último: ${escapeHtml(formatDate(event.last_seen || event.created_at))}</span>`;
        const eventType = String(event.event_type || "evento").replace(/[._-]+/g, " ");
        const ipVersion = String(event.ip || "").includes(":") ? "IPv6" : "IPv4";
        const browser = [client.browser, client.browserVersion].filter(Boolean).join(' ');
        const os = [client.os, client.osVersion].filter(Boolean).join(' ');
        const device = [client.device, client.deviceModel].filter(Boolean).join(' · ');
        return `<tr><td><span class="code-cell">${escapeHtml(event.ip || "Criptografado")}</span><span class="sub-cell">${ipVersion}</span></td><td>${escapeHtml(event.profile_code || "—")}</td><td>${escapeHtml(location)}</td><td>${escapeHtml(isp)}</td><td>${escapeHtml(device || "Desconhecido")}</td><td>${escapeHtml(browser || "—")}</td><td>${escapeHtml(os || "—")}</td><td>${escapeHtml(risk)}${event.risk_score != null ? `<span class="sub-cell">Pontuação de risco ${escapeHtml(event.risk_score)}/100</span>` : ""}</td><td>${activity}</td><td>${escapeHtml(eventType)}</td></tr>`;
      }).join("") : '<tr><td colspan="10" class="empty">Nenhum evento encontrado.</td></tr>';
    } catch (error) { $("ipTable").innerHTML = `<tr><td colspan="10" class="empty">${escapeHtml(error.message)}</td></tr>`; }
    finally { if (reloadButton) { reloadButton.disabled = false; reloadButton.textContent = "↻ Atualizar"; } }
  }
  async function clearIpEvents() {
    const accepted = window.confirm("Isso apagará todos os registros atuais de IP. Novos acessos voltarão a ser registrados normalmente. Deseja continuar?");
    if (!accepted) return;
    const button = $("clearIpEvents");
    button.disabled = true; button.textContent = "Limpando…";
    try {
      const result = await api("/api/admin/ip-events/clear", { method: "POST", body: JSON.stringify({ confirmation: "LIMPAR" }) });
      notify(`${Number(result.deleted || 0)} registros de IP removidos. Atualizando lista…`);
      await loadIp();
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; button.textContent = "⌫ Limpar histórico"; }
  }
  async function loadAudit() {
    try {
      const data = await api("/api/admin/audit?limit=100");
      $("auditTable").innerHTML = data.events.length ? data.events.map((event) => {
        let details = "";
        try { details = event.details ? JSON.stringify(event.details) : JSON.stringify(JSON.parse(event.details_json || "{}")); }
        catch { details = event.details_json || ""; }
        const detailsText = details === "{}" ? "—" : details;
        return `<tr><td>${formatDate(event.created_at)}</td><td><strong>${escapeHtml(event.action)}</strong></td><td>${escapeHtml(detailsText)}</td><td>${escapeHtml(event.target || event.actor || "—")}</td></tr>`;
      }).join("") : '<tr><td colspan="4" class="empty">Nenhum evento registrado.</td></tr>';
    } catch (error) { $("auditTable").innerHTML = `<tr><td colspan="4" class="empty">${escapeHtml(error.message)}</td></tr>`; }
  }

  async function loadCredential() {
    try {
      const credential = await api("/api/admin/credential");
      const overview = dashboardCache || await getDashboard();
      const labels = { local: "Runtime local", database: "Banco de dados (D1)", environment: "Secret do Worker", unconfigured: "Não configurada" };
      $("credentialSource").textContent = labels[credential.source] || credential.source || "—";
      $("credentialSource").classList.toggle("warning", credential.configured === false);
      $("credentialSummary").textContent = credential.configured === false
        ? "Defina uma nova senha para habilitar o acesso administrativo."
        : "A API valida esta credencial antes de emitir uma sessão administrativa.";
      $("credentialUpdated").textContent = credential.updatedAt ? formatDate(credential.updatedAt) : "—";
      $("credentialMinLength").textContent = `${credential.minLength || 16} caracteres`;
      $("credentialSessions").textContent = String(overview.security?.activeSessions ?? "—");
      $("credentialWarning").hidden = !credential.warning;
      $("credentialWarning").textContent = credential.warning || "";
    } catch (error) { $("credentialSummary").textContent = error.message; }
  }
  async function saveCredential(event) {
    event.preventDefault();
    const password = $("newAdminPassword").value;
    const errorEl = $("credentialError");
    errorEl.textContent = "";
    if (password.length < 16) { errorEl.textContent = "Use pelo menos 16 caracteres."; return; }
    if (password !== $("confirmAdminPassword").value) { errorEl.textContent = "As senhas não coincidem."; return; }
    if (!$("credentialConfirmation").checked) { errorEl.textContent = "Confirme a revogação das sessões atuais."; return; }
    const button = $("credentialForm").querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await api("/api/admin/credential", { method: "PUT", body: JSON.stringify({ password, confirmation: "TROCAR" }) });
      $("newAdminPassword").value = "";
      $("confirmAdminPassword").value = "";
      $("credentialConfirmation").checked = false;
      notify(result.warning || "Senha administrativa atualizada. Todas as sessões foram revogadas.");
      logout(false);
      $("loginError").textContent = result.warning || "Senha alterada. Entre novamente com a nova credencial.";
      $("adminPassword").focus();
    } catch (error) { errorEl.textContent = error.message; }
    finally { button.disabled = false; }
  }

  async function clearAudit() {
    if (!window.confirm("Isso removerá os registros atuais da auditoria. O evento desta limpeza será preservado. Continuar?")) return;
    const button = $("clearAudit");
    button.disabled = true;
    try {
      const result = await api("/api/admin/audit/clear", { method: "POST", body: JSON.stringify({ confirmation: "LIMPAR" }) });
      notify(`${Number(result.deleted || 0)} registros removidos. A limpeza foi registrada.`);
      await loadAudit();
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; }
  }

  $("loginForm").addEventListener("submit", login);
  $("logoutButton").addEventListener("click", () => logout(true));
  document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-open-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.openView)));
  $("refreshOverview").addEventListener("click", loadOverview);
  $("reloadProfiles").addEventListener("click", () => { page = 1; loadProfiles(); });
  $("searchProfiles").addEventListener("click", () => { page = 1; loadProfiles(); });
  $("profileSearch").addEventListener("keydown", (event) => { if (event.key === "Enter") { page = 1; loadProfiles(); } });
  $("profilesTable").addEventListener("change", (event) => { if (event.target.matches(".profile-check")) updateSelection(); });
  $("profilesTable").addEventListener("click", (event) => { const button = event.target.closest(".profile-reset"); if (button) resetProfileFromControl(button.dataset.code); });
  $("selectAllProfiles").addEventListener("change", (event) => { document.querySelectorAll(".profile-check:not(:disabled)").forEach((input) => input.checked = event.target.checked); updateSelection(); });
  $("suspendSelected").addEventListener("click", () => changeSelectedStatus("suspended"));
  $("activateSelected").addEventListener("click", () => changeSelectedStatus("active"));
  $("deleteSelected").addEventListener("click", deleteSelected);
  $("previousPage").addEventListener("click", () => { page = Math.max(1, page - 1); loadProfiles(); });
  $("nextPage").addEventListener("click", () => { page = Math.min(totalPages, page + 1); loadProfiles(); });
  $("reloadStorage").addEventListener("click", loadStorage);
  $("reloadEcosystem").addEventListener("click", () => loadEcosystem(true));
  $("reloadRoles").addEventListener("click", loadRolesView);
  $("reloadBadges").addEventListener("click", loadBadgesView);
  $("reloadFrames").addEventListener("click", loadFramesView);
  [["roleDefinitionSearch", "roleDefinitionList", "roleSearchHint"],
   ["roleAssignmentSearch", "roleAssignmentsList", "assignmentSearchHint"],
   ["collectionSearch", "collectionList", "collectionSearchHint"]].forEach(([inputId, listId, hintId]) => {
    $(inputId).addEventListener("input", () => filterList(listId, $(inputId).value, hintId));
  });
  $("catalogSearch").addEventListener("input", () => { catalogVisible = CATALOG_PAGE; renderCatalog(); });
  $("catalogMore").addEventListener("click", () => { catalogVisible += CATALOG_PAGE; renderCatalog(); });
  $("badgePurgeSearch").addEventListener("input", renderBadgePurgeList);
  document.querySelectorAll("[data-badge-tab]").forEach(button => button.addEventListener("click", () => {
    const purge = button.dataset.badgeTab === 'purge';
    $('badgeCatalogPane').hidden = purge;
    $('badgePurgePane').hidden = !purge;
    document.querySelectorAll('[data-badge-tab]').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }));
  $("previewRoles").addEventListener("click", () => openPreview('entitlementCode'));
  $("previewBadges").addEventListener("click", () => openPreview('badgeProfileCode'));
  $("previewClose").addEventListener("click", closePreview);
  $("previewOpenTab").addEventListener("click", () => { if (previewUrl) window.open(previewUrl, '_blank', 'noopener,noreferrer'); });
  $("previewModal").addEventListener("click", (event) => { if (event.target === $('previewModal')) closePreview(); });
  document.addEventListener("keydown", (event) => { if (event.key === 'Escape' && !$('previewModal').hidden) closePreview(); });
  ["roleDefinitionId", "roleDefinitionLabel", "roleDefinitionColor"].forEach(id => $(id).addEventListener("input", applyRolePreview));
  ["catalogId", "catalogName", "catalogDescription", "catalogIcon", "catalogCategory", "catalogRarity"].forEach(id => $(id).addEventListener("input", applyBadgePreview));
  $("catalogIconFile").addEventListener("change", () => { if ($("catalogIconFile").files?.length) { $("badgeEmojiPreview").textContent = "🖼️"; $("badgePreviewMeta").textContent = "PNG personalizado"; } else applyBadgePreview(); });
  $("saveCatalogItem").addEventListener("click", saveCatalogItem);
  $("frameAccess").addEventListener("change", syncFrameAccessFields);
  $("saveFrame").addEventListener("click", saveFrame);
  $("newFrame").addEventListener("click", resetFrameForm);
  $("frameCatalogSearch").addEventListener("input", renderFrameCatalog);
  document.querySelectorAll("[data-badge-preset]").forEach(button => button.addEventListener("click", () => applyBadgePreset(button.dataset.badgePreset)));
  document.querySelectorAll("[data-role-preset]").forEach(button => button.addEventListener("click", () => applyRolePreset(button.dataset.rolePreset)));
  $("saveCollection").addEventListener("click", saveCollection);
  $("newCollection").addEventListener("click", resetCollectionForm);
  $("saveBenefit").addEventListener("click", saveBenefit);
  $("newBenefit").addEventListener("click", resetBenefitForm);
  $("grantBenefit").addEventListener("click", () => mutateProfileBenefit("grant"));
  $("revokeBenefit").addEventListener("click", () => mutateProfileBenefit("revoke"));
  $("ecosystemCatalog").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-catalog]"); if (!button) return;
    $("catalogId").value = button.dataset.editCatalog;
    $("catalogName").value = button.dataset.catalogName || '';
    $("catalogDescription").value = button.dataset.catalogDescription || '';
    $("catalogRarity").value = button.dataset.catalogRarity || '1';
    $("catalogCategory").value = button.dataset.catalogCategory || 'server';
    $("catalogIsPublic").checked = button.dataset.catalogPublic !== '0';
    $("catalogIcon").value = button.dataset.catalogIcon || '✦';
    $("catalogIconFile").value = '';
    $("catalogId").focus();
    applyBadgePreview();
    notify('Insígnia carregada para edição. Envie um novo PNG apenas se quiser substituir o símbolo.');
  });
  $("saveStudioAccess").addEventListener("click", saveStudioAccess);
  $("saveRoleDefinition").addEventListener("click", saveRoleDefinition);
  $("newRoleDefinition").addEventListener("click", resetRoleDefinition);
  $("saveVip").addEventListener("click", saveVip);
  $("grantRole").addEventListener("click", () => mutateProfileRole("grant"));
  $("revokeRole").addEventListener("click", () => mutateProfileRole("revoke"));
  $("loadProfileRoles").addEventListener("click", loadProfileRoles);
  $("loadProfileBadges").addEventListener("click", () => loadProfileBadges());
  $("loadFrameProfile").addEventListener("click", () => loadFrameProfile());
  $("reloadRoleAssignments").addEventListener("click", loadRoleAssignments);
  $("grantBadge").addEventListener("click", () => mutateProfileCollectible("badges", "grant"));
  $("revokeBadge").addEventListener("click", () => mutateProfileCollectible("badges", "revoke"));
  $("grantFrame").addEventListener("click", () => mutateProfileCollectible("frames", "grant"));
  $("revokeFrame").addEventListener("click", () => mutateProfileCollectible("frames", "revoke"));
  $("saveMaintenance").addEventListener("click", saveMaintenance);
  $("searchMaintenanceProfiles").addEventListener("click", loadMaintenanceProfiles);
  $("maintenanceProfileSearch").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); loadMaintenanceProfiles(); } });
  $("maintenanceProfileChoices").addEventListener("change", event => {
    const input = event.target.closest("input[data-maintenance-code]"); if (!input) return;
    const code = input.dataset.maintenanceCode;
    if (input.checked) maintenanceAllowedCodes.add(code); else maintenanceAllowedCodes.delete(code);
    const lines = $("maintenanceAllowlist").value.split(/\r?\n/);
    $("maintenanceAllowlist").value = lines.filter(line => line.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^HTZ/, "") !== code.replace(/^HTZ/, "")).join("\n");
    maintenanceTextareaCodes = new Set($("maintenanceAllowlist").value.split(/\r?\n/).map(line => line.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^HTZ/, "")).filter(Boolean));
  });
  $("maintenanceAllowlist").addEventListener("input", () => {
    const next = new Set($("maintenanceAllowlist").value.split(/\r?\n/).map(line => line.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^HTZ/, "")).filter(Boolean));
    for (const previous of maintenanceTextareaCodes) if (!next.has(previous)) maintenanceAllowedCodes.delete(previous);
    for (const code of next) maintenanceAllowedCodes.add(code);
    maintenanceTextareaCodes = next;
  });
  $("uploadMaintenanceBackground").addEventListener("click", uploadMaintenanceBackground);
  ["maintenanceTitle", "maintenanceMessage"].forEach((id) => $(id).addEventListener("input", updateMaintenancePreviewText));
  ["maintenanceBackgroundUrl", "maintenanceBackgroundType", "maintenanceAccent", "maintenanceOverlay", "maintenanceBlur"].forEach((id) => $(id).addEventListener("input", () => { updateMaintenanceRangeLabels(); updateMaintenancePreview(); }));
  $("clearMaintenanceBackground").addEventListener("click", () => { $("maintenanceBackgroundUrl").value = ""; $("maintenanceBackgroundType").value = "color"; updateMaintenancePreview("", "color"); });
  $("reloadIp").addEventListener("click", loadIp);
  $("searchIp").addEventListener("click", loadIp);
  $("clearIpEvents").addEventListener("click", clearIpEvents);
  $("reloadAudit").addEventListener("click", loadAudit);
  $("clearAudit").addEventListener("click", clearAudit);

  $("reloadCredential").addEventListener("click", loadCredential);
  $("credentialForm").addEventListener("submit", saveCredential);

  setupStatus();
  setupLoginHint();
  syncFrameAccessFields();
  if (token) showApp(true); else showApp(false);
})();
