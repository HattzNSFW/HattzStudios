/* Hättz Profile Contract — normalização compartilhada e previsível do Studio. */
(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    glass: Object.freeze({ opacity: 72, blur: 18, reflection: 42, glow: 28, border: 45, depth: 42 }),
    avatar: Object.freeze({ size: 150, thickness: 2, offsetX: 0, offsetY: 0, lighting: 65, frameScale: 100, frameX: 0, frameY: 0 })
  });
  const clamp = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const isSafeFrameId = (value) => {
    const id = String(value ?? "");
    return id === "none" || /^[a-z0-9][a-z0-9_-]{1,47}$/i.test(id);
  };
  const normalizeStudio = (source = {}) => {
    const studio = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    const glass = studio.glass && typeof studio.glass === "object" && !Array.isArray(studio.glass) ? studio.glass : {};
    const avatar = studio.avatar && typeof studio.avatar === "object" && !Array.isArray(studio.avatar) ? studio.avatar : {};
    const rawCards = studio.cards && typeof studio.cards === "object" && !Array.isArray(studio.cards) ? studio.cards : {};
    const cards = {};
    for (const [key, item] of Object.entries(rawCards).slice(0, 100)) {
      if (!/^(stat|detail)_[A-Za-z0-9_-]{1,80}$/.test(key) || !item || typeof item !== "object" || Array.isArray(item)) continue;
      const normalized = {};
      if (item.opacity !== undefined) normalized.opacity = clamp(item.opacity, 72, 0, 100);
      if (item.blur !== undefined) normalized.blur = clamp(item.blur, 18, 0, 40);
      if (item.glow !== undefined) normalized.glow = clamp(item.glow, 28, 0, 100);
      if (Object.keys(normalized).length) cards[key] = normalized;
    }
    return {
      glass: {
        opacity: clamp(glass.opacity, 72, 0, 100),
        blur: clamp(glass.blur, 18, 0, 40),
        reflection: clamp(glass.reflection, 42, 0, 100),
        glow: clamp(glass.glow, 28, 0, 100),
        border: clamp(glass.border, 45, 0, 100),
        depth: clamp(glass.depth, 42, 0, 100)
      },
      cards,
      avatar: {
        size: clamp(avatar.size, 150, 110, 220),
        thickness: clamp(avatar.thickness, 2, 1, 8),
        offsetX: clamp(avatar.offsetX, 0, -30, 30),
        offsetY: clamp(avatar.offsetY, 0, -30, 30),
        lighting: clamp(avatar.lighting, 65, 0, 100),
        frameScale: clamp(avatar.frameScale, 100, 25, 200),
        frameX: clamp(avatar.frameX, 0, -100, 100),
        frameY: clamp(avatar.frameY, 0, -100, 100)
      }
    };
  };

  const api = Object.freeze({ version: "2.0.0", DEFAULTS, clamp, isSafeFrameId, normalizeStudio });
  if (typeof window !== "undefined") window.HATTZ_PROFILE_CONTRACT = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
