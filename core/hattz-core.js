(() => {
  "use strict";
  const apiBase = () => String(window.HATTZ_SHARE_CONFIG?.apiBase || "").trim().replace(/\/+$/, "");
  const profileStorageKey = (id = "perfil-1") => `meuPerfil:${["perfil-1","perfil-2"].includes(id) ? id : "perfil-1"}`;
  const getProfile = (id = "perfil-1") => {
    const key = profileStorageKey(id);
    const raw = localStorage.getItem(key) || (id === "perfil-1" ? localStorage.getItem("meuPerfil") : null);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  const setProfile = (id, profile) => localStorage.setItem(profileStorageKey(id), JSON.stringify(profile));
  const normalizeCode = (value) => {
    const code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^HTZ/, "");
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/.test(code) ? code : null;
  };
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const request = async (path, options = {}) => {
    const response = await fetch(`${apiBase()}${path}`, { cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}`);
    return data;
  };
  window.HATTZ_CORE = Object.freeze({ version: "1.0.0", apiBase, profileStorageKey, getProfile, setProfile, normalizeCode, escapeHTML, request });
})();
