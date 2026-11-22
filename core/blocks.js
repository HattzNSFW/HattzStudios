/* Hättz 2.0 — camada dos 8 blocos aplicada ao painel original.
   Identidade local, estados de persistência e coleções, sem login de usuário. */
(() => {
  "use strict";

  const VERSION = "2.0.0";
  const STATES = Object.freeze({ LOCAL: "local", SYNCED: "synced", PUBLISHED: "published" });
  const COLLECTIONS = Object.freeze([
    Object.freeze({ id: "nucleo", name: "Núcleo Hättz", badgeIds: Object.freeze(["default", "pulse", "connected"]), reward: "default" }),
    Object.freeze({ id: "ascensao", name: "Ascensão", badgeIds: Object.freeze(["genesis", "astral", "seraphim", "elysium"]), reward: "seraphim" }),
    Object.freeze({ id: "infinito", name: "Infinito", badgeIds: Object.freeze(["sapphire", "resonance", "sovereign", "omniverse", "phantom", "serendipity"]), reward: "omniverse" })
  ]);

  const memory = new Map();
  const storage = typeof localStorage !== "undefined" ? localStorage : null;
  const read = (key) => {
    try {
      const raw = storage ? storage.getItem(key) : memory.get(key);
      return raw ? JSON.parse(raw) || {} : {};
    } catch { return {}; }
  };
  const write = (key, value) => {
    try {
      const raw = JSON.stringify(value);
      if (storage) storage.setItem(key, raw);
      else memory.set(key, raw);
    } catch { /* armazenamento indisponível: a memória interna preserva a sessão */ }
  };
  const stateKey = (profileId) => `hattz-blocks:${profileId}`;
  const codeKey = (profileId) => `hattz-share-code:${profileId}`;

  function localId(profileId) {
    const state = read(stateKey(profileId));
    if (!state.localId) {
      state.localId = `local-${profileId}-${Date.now().toString(36)}`;
      write(stateKey(profileId), state);
    }
    return state.localId;
  }

  function badgeIds(profile) {
    const source = profile?.badges || profile?.insignias || profile?.conquistas || [];
    const list = Array.isArray(source) ? source : [];
    const ids = new Set();
    for (const item of list) {
      const value = typeof item === "string" ? item : item?.id || item?.code || item?.badgeId || item?.icon;
      const id = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (id) ids.add(id);
    }
    return ids;
  }

  function collections(profile) {
    const owned = badgeIds(profile);
    return COLLECTIONS.map((collection) => {
      const have = collection.badgeIds.filter((id) => owned.has(id));
      return {
        id: collection.id,
        name: collection.name,
        reward: collection.reward,
        owned: have.length,
        total: collection.badgeIds.length,
        complete: have.length === collection.badgeIds.length,
        progress: Math.round((have.length / collection.badgeIds.length) * 100)
      };
    });
  }

  function status(profileId, profile) {
    const state = read(stateKey(profileId));
    const code = (storage ? storage.getItem(codeKey(profileId)) : memory.get(codeKey(profileId))) || profile?.codigo || profile?.code || "";
    if (profile?.publishedAt || profile?.publicadoEm || state.published) return STATES.PUBLISHED;
    if (code) return STATES.SYNCED;
    return STATES.LOCAL;
  }

  function markSaved(profileId, profile) {
    const state = read(stateKey(profileId));
    state.localId = localId(profileId);
    state.savedAt = Date.now();
    state.dirty = false;
    write(stateKey(profileId), state);
    return status(profileId, profile);
  }

  function markDirty(profileId, profile) {
    const state = read(stateKey(profileId));
    state.localId = localId(profileId);
    state.dirty = true;
    write(stateKey(profileId), state);
    return status(profileId, profile);
  }

  function markPublished(profileId, profile) {
    const state = read(stateKey(profileId));
    state.localId = localId(profileId);
    state.published = true;
    state.publishedAt = Date.now();
    write(stateKey(profileId), state);
    return status(profileId, profile);
  }

  function init(profileId, profile) {
    return {
      version: VERSION,
      identity: localId(profileId),
      status: status(profileId, profile),
      collections: collections(profile)
    };
  }

  const api = Object.freeze({ VERSION, STATES, COLLECTIONS, init, localId, status, collections, markSaved, markDirty, markPublished });
  if (typeof window !== "undefined") window.HATTZ_BLOCKS = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
