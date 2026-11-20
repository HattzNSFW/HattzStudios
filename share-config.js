"use strict";

/**
 * Configuração pública e versionada do Hättz 2.0.
 * Nunca incluir secrets neste arquivo: ele é servido ao navegador.
 */
window.HATTZ_SHARE_CONFIG = Object.freeze({
  appName: "Hättz",
  release: "2.0.0",
  configVersion: 2,
  schemaVersion: 14,
  apiBase: "https://hattz-share-api.kl-santdev.workers.dev",
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
