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
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && authenticated) logout(false);
      throw new Error(data.error || `Falha HTTP ${response.status}`);
    }
    return data;
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
    try {
      const result = await api("/api/admin/auth/login", { method: "POST", body: JSON.stringify({ password: $("adminPassword").value }) }, false);
      token = result.token;
      sessionStorage.setItem(tokenKey, token);
      $("adminPassword").value = "";
      showApp(true);
      notify("Acesso autorizado.");
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; }
  }
  function setView(name) {
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
    document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    if (name === "profiles") loadProfiles();
    if (name === "ecosystem") loadEcosystem();
    if (name === "storage") loadStorage();
    if (name === "maintenance") loadMaintenance();
    if (name === "ip") loadIp();
    if (name === "audit") loadAudit();
  }
  async function loadOverview() {
    try {
      const [storage, maintenance] = await Promise.all([api("/api/admin/storage"), api("/api/admin/maintenance")]);
      $("apiStatus").textContent = "Operacional";
      $("apiStatus").classList.remove("warning");
      $("overviewMetrics").innerHTML = [
        ["Perfis na nuvem", storage.profileCount, `de ${storage.maxProfiles} permitidos`],
        ["Armazenamento usado", formatBytes(storage.totalBytes), `${storage.usagePercent.toFixed(1)}% da capacidade`],
        ["Espaço disponível", formatBytes(storage.remainingBytes), "capacidade global"],
        ["Perfis adicionais", storage.estimatedAdditionalProfilesByStorage ?? "—", "estimativa pelo consumo médio"]
      ].map(([label, value, hint]) => `<article class="metric glass"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`).join("");
      $("overviewStorageBar").style.width = `${storage.usagePercent}%`;
      $("overviewStorageText").textContent = `${formatBytes(storage.totalBytes)} / ${formatBytes(storage.maxBytes)}`;
      $("systemSummary").textContent = `${storage.profileCount} perfis cadastrados · ${storage.remainingProfilesByCount} vagas por limite de quantidade.`;
      $("maintenanceStatus").textContent = maintenance.enabled ? "Ativa" : "Desativada";
      $("maintenanceStatus").classList.toggle("warning", maintenance.enabled);
      $("maintenanceSummary").textContent = maintenance.enabled ? `${maintenance.title}: ${maintenance.message}` : "O acesso público está liberado.";
    } catch (error) { $("apiStatus").textContent = "Falha"; $("apiStatus").classList.add("warning"); notify(error.message); }
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
      await Promise.all([loadProfiles(), loadStorage(), loadOverview()]);
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
      await Promise.all([loadProfiles(), loadStorage(), loadOverview()]);
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
      await loadOverview();
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
      notify("Fundo enviado ao Supabase Storage. Salve a configuração para aplicar.");
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; button.textContent = "Enviar fundo"; }
  }
  async function loadEcosystem() {
    try {
      const [data, roleData] = await Promise.all([api('/api/admin/catalog'), api('/api/admin/roles')]);
      const frames = data.frames || [], badges = data.badges || [];
      const roles = roleData.roles || [];
      $('grantRoleId').innerHTML = roles.filter(x => Number(x.enabled) !== 0).map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.label)}</option>`).join('') || '<option value="">Nenhum cargo disponível</option>';
      $('roleDefinitionList').innerHTML = roles.map(role => `<div class="role-definition-row"><span class="role-preview-chip" style="--role-accent:${escapeHtml(role.color)}">${escapeHtml(role.label)}</span><span class="role-definition-meta">${escapeHtml(role.id)}${Number(role.enabled) === 0 ? ' · Desativado' : ''}</span><button type="button" class="quiet-button" data-edit-role="${escapeHtml(role.id)}">${Number(role.enabled) === 0 ? 'Editar / reativar' : 'Editar'}</button>${Number(role.enabled) !== 0 ? `<button type="button" class="quiet-button danger-action" data-delete-role="${escapeHtml(role.id)}">Desativar</button>` : ''}</div>`).join('') || '<p class="empty">Nenhum cargo cadastrado. Crie o primeiro acima.</p>';
      $('roleDefinitionList').querySelectorAll('[data-edit-role]').forEach(button => button.addEventListener('click', () => editRoleDefinition(roles.find(role => role.id === button.dataset.editRole))));
      $('roleDefinitionList').querySelectorAll('[data-delete-role]').forEach(button => button.addEventListener('click', () => removeRoleDefinition(button.dataset.deleteRole)));
      $('grantBadgeId').innerHTML = badges.filter(x => Number(x.enabled) !== 0 && x.award_mode !== 'automatic').map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)} · ${escapeHtml(x.rarityLabel || x.rarity)} · Manual</option>`).join('') || '<option value="">Nenhuma tag manual disponível</option>';
      $('grantFrameId').innerHTML = frames.filter(x => Number(x.enabled) !== 0).map(x => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)} · ${escapeHtml(x.rarityLabel || x.rarity)}</option>`).join('') || '<option value="">Nenhuma moldura disponível</option>';
      $('ecosystemCatalog').innerHTML = [...badges.map(x => ({...x,kind:'Insígnia',catalogKind:'badges'})),...frames.map(x=>({...x,kind:'Moldura',catalogKind:'frames'}))].map(x=>`<div class="audit-item"><span class="audit-time">${escapeHtml(x.kind)}</span><div><div class="audit-action">${escapeHtml(x.name)}</div><div class="audit-detail">${escapeHtml(x.description || '')}${x.kind === 'Insígnia' ? ` · ${x.award_mode === 'automatic' ? 'Concessão automática' : 'Concessão manual'} · ${escapeHtml(x.color || '#B8BCC8')} · ${x.is_public === 0 ? 'Oculta' : 'Pública'}` : ''}</div></div><span class="audit-target">${escapeHtml(x.rarityLabel || x.rarity)}${Number(x.enabled) === 0 ? ' · Desativada' : ''}</span><button type="button" class="quiet-button" data-edit-catalog="${escapeHtml(x.id)}" data-catalog-kind="${x.catalogKind}" data-catalog-name="${escapeHtml(x.name)}" data-catalog-description="${escapeHtml(x.description || '')}" data-catalog-rarity="${Number(x.rarity_level || 1)}" data-catalog-category="${escapeHtml(x.category || '')}" data-catalog-public="${x.is_public === 0 ? '0' : '1'}">Editar</button><button type="button" class="quiet-button danger-action" data-delete-catalog="${escapeHtml(x.id)}" data-catalog-kind="${x.catalogKind}">Desativar</button></div>`).join('') || '<p class="empty">Nenhuma tag ou moldura cadastrada. Crie cada item manualmente.</p>';
      $('ecosystemCatalog').querySelectorAll('[data-delete-catalog]').forEach(button => button.addEventListener('click', () => removeCatalogItem(button.dataset.catalogKind, button.dataset.deleteCatalog)));
      await loadRoleAssignments();
      await loadStudioAccess();
    } catch (error) { notify(error.message); }
  }
  async function loadRoleAssignments() {
    try {
      const data = await api('/api/admin/role-assignments');
      const assignments = [
        ...(data.assignments || []).map(item => ({ ...item, kind: 'Cargo', label: item.roleLabel, valid: item.expiresAt ? `Até ${formatDate(item.expiresAt)}` : 'Permanente' })),
        ...(data.tagAssignments || []).map(item => ({ ...item, kind: 'Tag', label: item.tagLabel, valid: 'Atribuída' }))
      ];
      $('roleAssignmentsList').innerHTML = assignments.length
        ? assignments.map(item => `<div class="audit-item"><span class="audit-time">${escapeHtml(item.kind)}</span><div><div class="audit-action">${escapeHtml(item.label)}</div><div class="audit-detail">${escapeHtml(item.profileName)}${item.username ? ` · @${escapeHtml(item.username)}` : ''} · ${escapeHtml(item.profileCode)}</div></div><span class="audit-target">${escapeHtml(item.valid)}</span></div>`).join('')
        : '<p class="empty">Nenhum perfil recebeu cargos ou tags ainda.</p>';
    } catch (error) { $('roleAssignmentsList').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }
  const ROLE_THEME_FIELDS = { background: 'roleThemeBackground', gradient: 'roleThemeGradient', card: 'roleThemeCard', accent: 'roleThemeAccent', text: 'roleThemeText', border: 'roleThemeBorder' };
  function editRoleDefinition(role) {
    if (!role) return;
    $('roleDefinitionId').value = role.id;
    $('roleDefinitionId').dataset.originalId = role.id;
    $('roleDefinitionLabel').value = role.label || '';
    $('roleDefinitionDescription').value = role.description || '';
    $('roleDefinitionColor').value = /^#[0-9a-f]{6}$/i.test(role.color || '') ? role.color : '#b99af0';
    Object.entries(ROLE_THEME_FIELDS).forEach(([key, id]) => { const value = role.theme?.[key]; $(id).value = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#0b0a10'; });
    $('saveRoleDefinition').textContent = 'Atualizar cargo';
    $('roleDefinitionId').readOnly = true;
    $('roleDefinitionLabel').focus();
  }
  function resetRoleDefinition() {
    ['roleDefinitionId','roleDefinitionLabel','roleDefinitionDescription'].forEach(id => $(id).value = '');
    delete $('roleDefinitionId').dataset.originalId;
    $('roleDefinitionId').readOnly = false;
    $('roleDefinitionColor').value = '#b99af0';
    Object.values(ROLE_THEME_FIELDS).forEach((id, index) => { $(id).value = ['#0b0a10','#292333','#14121b','#a78bfa','#f4f0fa','#302a3a'][index]; });
    $('saveRoleDefinition').textContent = 'Salvar cargo especial';
  }
  async function saveRoleDefinition() {
    const id = $('roleDefinitionId').value.trim().toLowerCase();
    const body = { id, label: $('roleDefinitionLabel').value.trim(), description: $('roleDefinitionDescription').value.trim(), color: $('roleDefinitionColor').value, theme: Object.fromEntries(Object.entries(ROLE_THEME_FIELDS).map(([key, field]) => [key, $(field).value])) };
    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) { notify('Use um ID de 2 a 48 caracteres, sem espaços.'); return; }
    if (!body.label) { notify('Informe o nome do cargo.'); return; }
    try {
      const editing = Boolean($('roleDefinitionId').dataset.originalId);
      await api(editing ? `/api/admin/roles/${encodeURIComponent(id)}` : '/api/admin/roles', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) });
      notify(editing ? 'Cargo e tema atualizados.' : 'Cargo especial criado.');
      resetRoleDefinition();
      await loadEcosystem();
    } catch (error) { notify(error.message); }
  }

  async function loadStudioAccess() {
    try {
      const data = await api('/api/admin/studio-access');
      const selected = new Set(data.roleIds || []);
      $('studioAccessRoles').innerHTML = (data.roles || []).map(role => `<label class="role-access-option"><input type="checkbox" value="${escapeHtml(role.id)}" ${selected.has(role.id)?'checked':''}><span>${escapeHtml(role.label)}</span><small>${escapeHtml(role.id)}</small></label>`).join('') || '<p class="empty">Crie cargos antes de configurar o acesso.</p>';
    } catch(error) { $('studioAccessRoles').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
  }
  async function saveStudioAccess() {
    const roleIds = [...$('studioAccessRoles').querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value);
    try { await api('/api/admin/studio-access',{method:'PUT',body:JSON.stringify({roleIds})}); notify('Permissões do editor do Studio atualizadas.'); }
    catch(error) { notify(error.message); }
  }

  async function saveCatalogItem() {
    const kind = $('catalogKind').value, id = $('catalogId').value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) { notify('Use um ID de 2 a 48 caracteres: letras, números, hífen ou sublinhado.'); return; }
    const body = { name:$('catalogName').value, description:$('catalogDescription').value, rarityLevel:Number($('catalogRarity').value), isPublic:$('catalogIsPublic')?.checked !== false };
    const readPng = (file, limit) => new Promise((resolve,reject)=>{ if(!file){resolve("");return;} if(file.type!=="image/png"||file.size>limit){reject(new Error(`Envie um PNG de até ${Math.round(limit/1024)} KB.`));return;} const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(new Error("Não foi possível ler o PNG.")); reader.readAsDataURL(file); });
    try {
      if (kind === 'badges') { body.category=$('catalogCategory').value; body.icon=await readPng($('catalogIconFile').files?.[0],128*1024)||$('catalogIcon').value||'✦'; }
      else { body.asset={ imageData: await readPng($('catalogFrameFile').files?.[0],300*1024), scale:Number($('catalogFrameScale').value), x:Number($('catalogFrameX').value), y:Number($('catalogFrameY').value) }; }
    } catch(error) { notify(error.message); return; }
    try { await api(`/api/admin/catalog/${kind}/${encodeURIComponent(id)}`, {method:'PUT',body:JSON.stringify(body)}); notify('Item salvo no catálogo.'); await loadEcosystem(); }
    catch(error) { notify(error.message); }
  }
  async function removeRoleDefinition(id) {
    if (!id || !window.confirm(`Desativar o cargo "${id}"? As atribuições serão preservadas e voltarão a valer se o cargo for reativado.`)) return;
    try {
      await api(`/api/admin/roles/${encodeURIComponent(id)}`, { method: 'DELETE' });
      notify('Cargo desativado. As atribuições foram preservadas.');
      resetRoleDefinition();
      await Promise.all([loadEcosystem(), loadRoleAssignments()]);
    } catch (error) { notify(error.message); }
  }
  async function removeCatalogItem(kind, id) {
    if (!id || !window.confirm(`Desativar "${id}"? As concessões históricas serão preservadas e voltarão a aparecer se o item for reativado.`)) return;
    try {
      await api(`/api/admin/catalog/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      notify('Item desativado. As concessões foram preservadas.');
      await loadEcosystem();
    } catch (error) { notify(error.message); }
  }
  function entitlementCode() { const raw=$('entitlementCode').value.trim().toUpperCase(); return raw.replace(/^HTZ-?/,'').replace(/-/g,''); }
  async function saveVip() {
    const code=entitlementCode(); if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)){notify('Informe um código de perfil válido.');return;}
    const enabled=$('vipEnabled').value==='true';
    const expiry=$('vipExpiry').value;
    const expiryMs=expiry ? new Date(expiry).getTime() : null;
    if (enabled && expiry && (!Number.isFinite(expiryMs) || expiryMs <= Date.now())) { notify('A validade do VIP precisa ser uma data futura válida.'); return; }
    const body={vip:enabled,vipExpiresAt:enabled ? expiryMs : null,benefits:{profileStorageLimitBytes:524288000}};
    try { const result=await api(`/api/admin/profiles/${code}/entitlements`,{method:'PUT',body:JSON.stringify(body)}); notify(result.vip?'VIP concedido.':'VIP revogado.'); }
    catch(error){notify(error.message);}
  }
  async function mutateProfileCollectible(type, action) {
    const code=entitlementCode(); if(!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)){notify('Informe um código de perfil válido.');return;}
    const isBadge=type==='badges', id=$(isBadge?'grantBadgeId':'grantFrameId').value;
    if(!id){notify('Cadastre ou selecione um item primeiro.');return;}
    const body=isBadge?{badgeId:id,action}:{frameId:id,action};
    try{await api(`/api/admin/profiles/${code}/${type}`,{method:'POST',body:JSON.stringify(body)});notify(`${isBadge?'Tag':'Moldura'} ${action==='grant'?'concedida':'revogada'}.`);await Promise.all([loadProfileBadges(),loadRoleAssignments()]);}
    catch(error){notify(error.message);}
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

  async function loadProfileBadges() {
    const code = entitlementCode();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code)) { notify('Informe um código de perfil válido.'); return; }
    try {
      const [badgeData, frameData] = await Promise.all([
        api(`/api/admin/profiles/${code}/badges`),
        api(`/api/admin/profiles/${code}/frames`)
      ]);
      const items = [
        ...(badgeData.badges || []).map(item => ({ kind: 'Tag', ...item })),
        ...(frameData.frames || []).map(item => ({ kind: 'Moldura', ...item }))
      ];
      $('profileBadgeList').innerHTML = items.length
        ? items.map(item => `<div class="role-row"><strong>${escapeHtml(item.kind)} · ${escapeHtml(item.name)}</strong><span>${escapeHtml(item.id)}</span></div>`).join('')
        : '<p class="empty">Este perfil não possui tags ou molduras atribuídas.</p>';
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
      $("auditList").innerHTML = data.events.length ? data.events.map((event) => {
        let details = ""; try { details = JSON.stringify(JSON.parse(event.details_json || "{}")); } catch { details = event.details_json || ""; }
        return `<div class="audit-item"><span class="audit-time">${formatDate(event.created_at)}</span><div><div class="audit-action">${escapeHtml(event.action)}</div><div class="audit-detail">${escapeHtml(details)}</div></div><span class="audit-target">${escapeHtml(event.target || event.actor)}</span></div>`;
      }).join("") : '<p class="empty">Nenhum evento registrado.</p>';
    } catch (error) { $("auditList").innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
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
  $("reloadEcosystem").addEventListener("click", loadEcosystem);
  $("catalogKind").addEventListener("change", () => { const badges=$("catalogKind").value === "badges"; $("catalogBadgeFields").hidden = !badges; $("catalogFrameFields").hidden = badges; });
  $("saveCatalogItem").addEventListener("click", saveCatalogItem);
  $("ecosystemCatalog").addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-catalog]"); if (!button) return;
    const kind = button.dataset.catalogKind; $("catalogKind").value = kind; $("catalogKind").dispatchEvent(new Event("change"));
    $("catalogId").value = button.dataset.editCatalog; $("catalogName").value = button.dataset.catalogName || "";
    $("catalogDescription").value = button.dataset.catalogDescription || ""; $("catalogRarity").value = button.dataset.catalogRarity || "1";
    if (kind === "badges") { $("catalogCategory").value = button.dataset.catalogCategory || ""; $("catalogIsPublic").checked = button.dataset.catalogPublic !== "0"; $("catalogIcon").value = "✦"; $("catalogIconFile").value = ""; }
    else { $("catalogFrameFile").value = ""; }
    $("catalogId").focus(); notify("Item carregado para edição. Envie um novo PNG se quiser substituir a imagem atual.");
  });
  $("saveStudioAccess").addEventListener("click", saveStudioAccess);
  $("saveRoleDefinition").addEventListener("click", saveRoleDefinition);
  $("newRoleDefinition").addEventListener("click", resetRoleDefinition);
  $("saveVip").addEventListener("click", saveVip);
  $("grantRole").addEventListener("click", () => mutateProfileRole("grant"));
  $("revokeRole").addEventListener("click", () => mutateProfileRole("revoke"));
  $("loadProfileRoles").addEventListener("click", loadProfileRoles);
  $("loadProfileBadges").addEventListener("click", loadProfileBadges);
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

  if (token) showApp(true); else showApp(false);
})();
