"use strict";

/**
 * Configuração pública e versionada do Hättz 2.0.
 * Nunca incluir secrets neste arquivo: ele é servido ao navegador.
 *
 * Em localhost (inclusive IP privado da rede) a API é o runtime local (server.mjs).
 * Em domínio público, o comportamento original do v12 é preservado: Worker remoto.
 * Para forçar uma URL, defina window.HATTZ_API_BASE_OVERRIDE antes deste script.
 */
(() => {
  const REMOTE = "https://hattz-share-api.kl-santdev.workers.dev";
  const host = String(window.location?.hostname || "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  const configured = String(window.HATTZ_API_BASE_OVERRIDE || (local ? window.location.origin : REMOTE)).replace(/\/+$/, "");

  window.HATTZ_SHARE_CONFIG = Object.freeze({
    appName: "Hättz",
    release: "2.0.0",
    configVersion: 2,
    schemaVersion: 14,
    apiBase: configured,
    mode: local ? "local" : "remote",
    endpoints: Object.freeze({
      health: "/api/health",
      catalog: "/api/catalog",
      entitlements: "/api/profiles/{code}/entitlements"
    }),
    storage: Object.freeze({
      profilePrefix: "meuPerfil:",
      themesPrefix: "meuTemas:",
      ownerTokenPrefix: "hattz-share-owner:",
      publicCodePrefix: "hattz-share-code:",
      backupKey: "hattz2:last-backup"
    }),
    features: Object.freeze({
      collections: true,
      benefits: true,
      privateBadgesByDefault: true,
      frameAccessModes: ["public", "vip", "role"],
      connectionStatus: true,
      backupRestore: true
    })
  });
})();
