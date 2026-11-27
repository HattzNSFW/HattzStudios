/* Hättz Profile Contract — normalização compartilhada e previsível do Studio. */
(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    glass: Object.freeze({ opacity: 72, blur: 18, reflection: 42, glow: 28, border: 45, depth: 42 }),
    avatar: Object.freeze({ size: 150, thickness: 2, offsetX: 0, offsetY: 0, lighting: 65, frameScale: 100, frameX: 0, frameY: 0, frameAutoFit: true })
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
        frameY: clamp(avatar.frameY, 0, -100, 100),
        frameAutoFit: avatar.frameAutoFit !== false
      }
    };
  };

  /* Ajuste automático de moldura PNG: mede a arte e devolve escala/centro.
     A referência é a moldura de 150 px usada no Control sobre a foto de 112 px. */
  const FRAME_REFERENCE_SIZE = 150;
  const frameFitClamp = (value, fallback, min, max) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };
  const measureFrameImage = (img) => {
    if (!img || !img.naturalWidth || !img.naturalHeight || typeof document === "undefined") return null;
    const sample = 192;
    const canvas = document.createElement("canvas");
    canvas.width = sample; canvas.height = sample;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    // object-fit: contain — desenha dentro do quadrado sem deformar a arte.
    const ratio = Math.min(sample / img.naturalWidth, sample / img.naturalHeight);
    const drawWidth = img.naturalWidth * ratio;
    const drawHeight = img.naturalHeight * ratio;
    ctx.drawImage(img, (sample - drawWidth) / 2, (sample - drawHeight) / 2, drawWidth, drawHeight);
    let pixels;
    try { pixels = ctx.getImageData(0, 0, sample, sample).data; } catch { return null; }
    let minX = sample, minY = sample, maxX = -1, maxY = -1;
    for (let y = 0; y < sample; y += 1) {
      for (let x = 0; x < sample; x += 1) {
        if (pixels[(y * sample + x) * 4 + 3] <= 16) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return { baseScale: 100, centerX: .5, centerY: .5 };
    const span = Math.max(maxX - minX + 1, maxY - minY + 1) || sample;
    return {
      baseScale: frameFitClamp(sample / span * 100, 100, 40, 400),
      centerX: (minX + maxX) / (2 * sample),
      centerY: (minY + maxY) / (2 * sample)
    };
  };
  const autoFrameAdjust = (info, containerSize, avatar = {}) => {
    const measured = info && typeof info === "object" ? info : { baseScale: 100, centerX: .5, centerY: .5 };
    const size = frameFitClamp(containerSize, FRAME_REFERENCE_SIZE, 80, 400);
    const multiplier = frameFitClamp(avatar.frameScale, 100, 25, 200) / 100;
    const scale = frameFitClamp(measured.baseScale * (FRAME_REFERENCE_SIZE / size) * multiplier, 100, 25, 200);
    const ratio = scale / 100;
    const round = (value) => Math.round(value * 10) / 10;
    return {
      scale: round(scale),
      x: round((.5 - measured.centerX) * size * ratio + frameFitClamp(avatar.frameX, 0, -100, 100)),
      y: round((.5 - measured.centerY) * size * ratio + frameFitClamp(avatar.frameY, 0, -100, 100))
    };
  };
  const manualFrameAdjust = (asset = {}, avatar = {}) => {
    const round = (value) => Math.round(value * 10) / 10;
    return {
      scale: round(frameFitClamp(asset.scale, 100, 25, 200) * frameFitClamp(avatar.frameScale, 100, 25, 200) / 100),
      x: round(frameFitClamp(asset.x, 0, -100, 100) + frameFitClamp(avatar.frameX, 0, -100, 100)),
      y: round(frameFitClamp(asset.y, 0, -100, 100) + frameFitClamp(avatar.frameY, 0, -100, 100))
    };
  };
  const frameFit = Object.freeze({ FRAME_REFERENCE_SIZE, measureFrameImage, autoFrameAdjust, manualFrameAdjust });

  const api = Object.freeze({ version: "2.0.0", DEFAULTS, clamp, isSafeFrameId, normalizeStudio, frameFit });
  if (typeof window !== "undefined") {
    window.HATTZ_PROFILE_CONTRACT = api;
    window.HATTZ_FRAME_FIT = frameFit;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
