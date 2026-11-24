/* Hättz Core 2.0 — configuração, contrato, API, status, erros e recuperação. */
(() => {
  "use strict";

  const VALID_PROFILE_IDS = new Set(["perfil-1", "perfil-2"]);
  const VALID_STATES = new Set(["idle", "online", "offline", "syncing", "degraded", "error"]);
  const config = () => window.HATTZ_SHARE_CONFIG || {};
  const release = () => String(config().release || window.HATTZ_CORE_LEGACY_VERSION || "2.0.0");
  const configVersion = () => Number(config().configVersion || 1);
  const contractVersion = () => String(window.HATTZ_PROFILE_CONTRACT?.version || "1.0.0");
  const apiBase = () => String(config().apiBase || "").trim().replace(/\/+$/, "");

  const resolveProfileId = (id = "perfil-1") => VALID_PROFILE_IDS.has(String(id)) ? String(id) : "perfil-1";
  const profileStorageKey = (id = "perfil-1") => `${config().storage?.profilePrefix || "meuPerfil:"}${resolveProfileId(id)}`;
  const themesStorageKey = (id = "perfil-1") => `${config().storage?.themesPrefix || "meuTemas:"}${resolveProfileId(id)}`;
  const ownerTokenKey = (id = "perfil-1") => `${config().storage?.ownerTokenPrefix || "hattz-share-owner:"}${resolveProfileId(id)}`;
  const publicCodeKey = (id = "perfil-1") => `${config().storage?.publicCodePrefix || "hattz-share-code:"}${resolveProfileId(id)}`;

  const safeStorage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
    remove(key) { try { localStorage.removeItem(key); return true; } catch { return false; } },
    keys() { try { return Object.keys(localStorage); } catch { return []; } }
  };

  const getProfile = (id = "perfil-1") => {
    const raw = safeStorage.get(profileStorageKey(id)) ||
      (resolveProfileId(id) === "perfil-1" ? safeStorage.get("meuPerfil") : null);
    if (!raw) return null;
    try { const parsed = JSON.parse(raw); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null; }
    catch { return null; }
  };
  const setProfile = (id, profile) => safeStorage.set(profileStorageKey(id), JSON.stringify(profile));
  const getThemes = (id = "perfil-1") => {
    const raw = safeStorage.get(themesStorageKey(id)) ||
      (resolveProfileId(id) === "perfil-1" ? safeStorage.get("meuTemas") : null);
    if (!raw) return [];
    try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  };
  const setThemes = (id, themes) => safeStorage.set(themesStorageKey(id), JSON.stringify(themes));

  const normalizeCode = (value) => {
    const code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^HTZ/, "");
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code) ? code : null;
  };
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const listeners = new Set();
  let connection = Object.freeze({ state: "idle", detail: "", at: 0 });
  const errors = [];

  const setConnectionState = (state, detail = "") => {
    const safeState = VALID_STATES.has(String(state)) ? String(state) : "error";
    const next = Object.freeze({ state: safeState, detail: String(detail || "").slice(0, 240), at: Date.now() });
    connection = next;
    for (const listener of [...listeners]) {
      try { listener(next); } catch (error) { reportError(error, "connection-listener"); }
    }
    return next;
  };
  const getConnectionState = () => connection;
  const subscribeConnection = (listener) => {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    try { listener(connection); } catch {}
    return () => listeners.delete(listener);
  };

  const DIAGNOSTICS_KEY = "hattz2:diagnostics";

  const diagnosticsEnabled = () => {
    try {
      if (new URLSearchParams(window.location.search || "").get("diag") === "1") return true;
      return sessionStorage.getItem(DIAGNOSTICS_KEY) === "1";
    } catch { return false; }
  };

  const scrub = (value) => String(value ?? "")
    .replace(/HTZ-[A-Z0-9-]{6,}/gi, "[redacted]")
    .replace(/\b[A-HJ-NP-Z2-9]{10}\b/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/data:[^\s"'<>)]+/gi, "data:[redacted]")
    .replace(/[?&][^=&#\s]+=[^&#\s]*/g, "[redacted]");

  const reportError = (error, context = "geral") => {
    const entry = Object.freeze({
      context: scrub(context).slice(0, 64),
      message: scrub(error?.message || error || "Erro desconhecido").slice(0, 300),
      at: Date.now()
    });
    errors.push(entry);
    if (errors.length > 20) errors.shift();
    if (diagnosticsEnabled() && typeof console !== "undefined" && typeof console.warn === "function") {
      try { console.warn(`[Hättz ${release()}] ${entry.context}: ${entry.message}`); } catch {}
    }
    return entry;
  };
  const getErrors = () => [...errors];
  const clearErrors = () => { errors.length = 0; };

  let globalHookInstalled = false;
  function installGlobalErrorHook() {
    if (globalHookInstalled || typeof window === "undefined" || typeof window.addEventListener !== "function") return false;
    globalHookInstalled = true;
    window.addEventListener("error", (event) => {
      try {
        const target = event.target;
        const isResource = target && target !== window &&
          (typeof document === "undefined" || target !== document) &&
          ["SCRIPT", "LINK", "IMG"].includes(target.tagName);
        if (isResource) {
          reportError(`Falha ao carregar ${target.tagName.toLowerCase()}: ${target.src || target.href || "recurso"}`, "resource:error");
          return;
        }
        reportError(event.error || event.message || "Erro de execução", "window:error");
      } catch {}
    }, true);
    window.addEventListener("unhandledrejection", (event) => {
      try { reportError(event.reason || "Promessa rejeitada", "promise:rejection"); } catch {}
    });
    return true;
  }
  installGlobalErrorHook();

  const request = async (path, options = {}) => {
    const base = apiBase();
    if (!base) throw new Error("API não configurada.");
    const { timeout = 20000, signal, ...fetchOptions } = options;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
    const timer = setTimeout(abort, Math.max(1000, Number(timeout) || 20000));
    setConnectionState("syncing", String(path));
    try {
      const response = await fetch(`${base}${String(path).startsWith("/") ? path : `/${path}`}`, {
        cache: "no-store",
        ...fetchOptions,
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error || data.message || `Falha HTTP ${response.status}`);
        error.status = response.status;
        error.payload = data;
        setConnectionState(response.status >= 500 ? "degraded" : "error", error.message);
        reportError(error, `api:${path}`);
        throw error;
      }
      setConnectionState("online");
      return data;
    } catch (error) {
      if (error?.name === "AbortError" && !signal?.aborted) {
        const timeoutError = new Error("A API não respondeu a tempo.");
        timeoutError.code = "TIMEOUT";
        setConnectionState("offline", timeoutError.message);
        reportError(timeoutError, `api:${path}`);
        throw timeoutError;
      }
      if (!error?.status) {
        setConnectionState("offline", String(error?.message || "Falha de conexão"));
        reportError(error, `api:${path}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abort);
    }
  };

  const createBackup = (id = "perfil-1") => Object.freeze({
    app: config().appName || "Hättz",
    kind: "hattz-profile-backup",
    release: release(),
    configVersion: configVersion(),
    contractVersion: contractVersion(),
    exportedAt: new Date().toISOString(),
    profileId: resolveProfileId(id),
    profile: getProfile(id),
    themes: getThemes(id),
    publicCode: safeStorage.get(publicCodeKey(id)) || ""
  });

  const validateBackup = (payload) => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Arquivo de backup inválido.");
    const compatible = payload.kind === "hattz-profile-backup" || payload.app === "Kl Personal Space" || payload.app === "Hättz";
    if (!compatible || !payload.profile || typeof payload.profile !== "object" || Array.isArray(payload.profile)) {
      throw new Error("Este arquivo não é um backup Hättz compatível.");
    }
    return payload;
  };

  const restoreBackup = (payload, id = "perfil-1", options = {}) => {
    const backup = validateBackup(payload);
    const targetId = resolveProfileId(options.profileId || backup.profileId || id);
    const current = getProfile(targetId) || {};
    const profile = options.merge === true ? { ...current, ...backup.profile } : backup.profile;
    if (window.HATTZ_PROFILE_CONTRACT?.normalizeStudio && profile.studio) {
      profile.studio = window.HATTZ_PROFILE_CONTRACT.normalizeStudio(profile.studio);
    }
    if (!setProfile(targetId, profile)) throw new Error("Não foi possível gravar o perfil restaurado.");
    if (Array.isArray(backup.themes) && backup.themes.length) setThemes(targetId, backup.themes);
    safeStorage.set(config().storage?.backupKey || "hattz2:last-backup", JSON.stringify({ restoredAt: Date.now(), targetId, release: backup.release }));
    return { profileId: targetId, profile };
  };

  const api = Object.freeze({
    version: "2.0.0",
    release,
    configVersion,
    contractVersion,
    config,
    apiBase,
    profileStorageKey,
    themesStorageKey,
    ownerTokenKey,
    publicCodeKey,
    getProfile,
    setProfile,
    getThemes,
    setThemes,
    normalizeCode,
    escapeHTML,
    request,
    getConnectionState,
    setConnectionState,
    subscribeConnection,
    reportError,
    getErrors,
    clearErrors,
    installGlobalErrorHook,
    createBackup,
    validateBackup,
    restoreBackup
  });

  window.HATTZ_CORE = api;
  window.HATTZ_CONFIG = config();
})();
