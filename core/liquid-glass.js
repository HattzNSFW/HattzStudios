/* Hättz Liquid Glass — personalizador independente por tela.
   Share, Studio e Control têm temas próprios; a ponte de tema abaixo
   leva os tokens --lg-* para toda a interface, sem dependências. */
(function () {
  "use strict";

  var KEY = "hattz_liquid_glass_v2";
  var LEGACY_KEY = "hattz_liquid_glass_v1";
  var SCOPES = ["share", "studio", "control"];
  var SCOPE_LABELS = { share: "SHARE", studio: "STUDIO", control: "CONTROL" };

  /* Insígnias em emoji: leve, nítido e sem o quadrado das imagens PNG. */
  var BADGE_EMOJI = [
    [/founder|owner|dono|creator|criador|nucleo|núcleo|crown/i, "👑"],
    [/vip|premium|elite|legend|lend|diamond|diamante/i, "💎"],
    [/admin|staff|moder|dev|official|oficial|shield|seguro/i, "🛡️"],
    [/genesis|astral|seraph|elysium|sapphire|resonance|sovereign|omniverse|phantom|serendipity/i, "🌌"],
    [/pulse|connected|conectado|active|ativo|energy|energia/i, "⚡"],
    [/music|song|som|audio|disco/i, "🎵"],
    [/art|artist|desenho|paint/i, "🎨"],
    [/star|estrela|shine/i, "⭐"],
    [/fire|fogo|hot/i, "🔥"],
    [/heart|cora|love|amor/i, "💜"],
    [/gift|presente|reward|recompensa/i, "🎁"],
    [/beta|teste|lab/i, "🧪"]
  ];
  function badgeEmoji(item) {
    var icon = String((item && item.icon) || "").trim();
    if (icon && !/^data:image|^https?:|^assets\//i.test(icon) && /[^\x00-\x7F]/.test(icon)) return icon;
    var text = [item && item.id, item && item.name, item && item.label, item && item.category, icon]
      .filter(Boolean).join(" ");
    for (var index = 0; index < BADGE_EMOJI.length; index++) {
      if (BADGE_EMOJI[index][0].test(text)) return BADGE_EMOJI[index][1];
    }
    return "✦";
  }
  window.HattzEmoji = { badge: badgeEmoji };

  var defaults = {
    tint: "203, 170, 255",
    tint2: "140, 124, 255",
    cyan: "140, 228, 255",
    surface: "24, 22, 35",
    border: "255, 255, 255",
    bgBase: "7, 7, 13",
    bgA: "112, 78, 180",
    bgB: "70, 95, 195",
    bgC: "132, 72, 180",
    alpha: 0.56,
    borderAlpha: 0.105,
    highlight: 0.15,
    sheen: 0.15,
    glow: 0.34,
    shadow: 0.42,
    blur: 30,
    saturate: 165,
    radius: 26,
    speed: 0.22
  };

  var presets = {
    violeta: {},
    ciano: {
      tint: "140, 228, 255", tint2: "105, 150, 255", cyan: "168, 255, 240",
      bgA: "38, 122, 170", bgB: "52, 82, 190", bgC: "70, 150, 180"
    },
    rose: {
      tint: "255, 176, 214", tint2: "205, 120, 190", cyan: "255, 206, 230",
      bgA: "160, 60, 120", bgB: "100, 55, 150", bgC: "180, 70, 110"
    },
    esmeralda: {
      tint: "150, 240, 205", tint2: "90, 190, 165", cyan: "190, 255, 225",
      bgA: "40, 130, 110", bgB: "55, 110, 150", bgC: "45, 140, 120"
    }
  };

  // [chave, rótulo, min, max, passo, sufixo, fator de conversão]
  var ranges = [
    ["alpha", "Opacidade do vidro", 10, 100, 1, "%", 100],
    ["blur", "Desfoque", 0, 60, 1, " px", 1],
    ["saturate", "Saturação", 100, 220, 1, "%", 1],
    ["radius", "Arredondamento", 10, 40, 1, " px", 1],
    ["borderAlpha", "Intensidade da borda", 0, 40, 1, "%", 100],
    ["highlight", "Reflexo superior", 0, 40, 1, "%", 100],
    ["sheen", "Brilho diagonal", 0, 40, 1, "%", 100],
    ["glow", "Glow dos ícones", 0, 100, 1, "%", 100],
    ["shadow", "Profundidade da sombra", 0, 80, 1, "%", 100],
    ["speed", "Velocidade das animações", 80, 600, 10, " ms", 1000]
  ];

  var colors = [
    ["tint", "Destaque"],
    ["tint2", "Destaque secundário"],
    ["cyan", "Toque ciano"],
    ["surface", "Superfície do vidro"],
    ["border", "Cor da borda"],
    ["bgBase", "Fundo base"],
    ["bgA", "Aurora 1"],
    ["bgB", "Aurora 2"],
    ["bgC", "Aurora 3"]
  ];

  var variableMap = {
    tint: "--lg-tint", tint2: "--lg-tint-2", cyan: "--lg-cyan",
    surface: "--lg-surface", border: "--lg-border",
    bgBase: "--lg-bg-base", bgA: "--lg-bg-a", bgB: "--lg-bg-b", bgC: "--lg-bg-c",
    alpha: "--lg-alpha", borderAlpha: "--lg-border-alpha",
    highlight: "--lg-highlight-alpha", sheen: "--lg-sheen-alpha",
    glow: "--lg-glow-alpha", shadow: "--lg-shadow-alpha",
    blur: "--lg-blur", saturate: "--lg-saturate", radius: "--lg-radius", speed: "--lg-speed"
  };

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function detectScope() {
    // Usa só o nome do arquivo: o caminho /HattzStudios/ contém "studio"
    // e faria o Share ser detectado como Studio no GitHub Pages.
    var path = (window.location.pathname || "").toLowerCase();
    var file = path.split("/").pop() || "";
    if (file.indexOf("control") >= 0) return "control";
    if (file.indexOf("studio") >= 0) return "studio";
    return "share";
  }
  var scope = detectScope();

  function hexToRgb(hex) {
    var clean = String(hex || "").replace("#", "").trim();
    if (clean.length === 3) clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)].join(", ");
  }

  function rgbToHex(rgb) {
    var parts = String(rgb || "").split(",").map(function (part) { return parseInt(part.trim(), 10); });
    if (parts.length !== 3 || parts.some(function (n) { return !isFinite(n) || n < 0 || n > 255; })) return "#ffffff";
    return "#" + parts.map(function (n) { return ("0" + n.toString(16)).slice(-2); }).join("");
  }

  function sanitize(raw) {
    var theme = clone(defaults);
    if (!raw || typeof raw !== "object") return theme;
    ranges.forEach(function (item) {
      var value = Number(raw[item[0]]);
      // Valores salvos já usam a unidade dos defaults (fração, px, % ou s);
      // o fator do slider serve apenas para exibição.
      if (isFinite(value)) theme[item[0]] = clamp(value, item[2] / item[6], item[3] / item[6]);
    });
    colors.forEach(function (item) {
      var value = raw[item[0]];
      if (typeof value === "string" && /^\d{1,3},\s?\d{1,3},\s?\d{1,3}$/.test(value)) theme[item[0]] = value;
    });
    return theme;
  }

  function emptyStore() {
    var store = {};
    SCOPES.forEach(function (name) { store[name] = clone(defaults); });
    return store;
  }

  function loadStore() {
    var store = emptyStore();
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (error) { raw = null; }
    if (raw && typeof raw === "object") {
      SCOPES.forEach(function (name) { store[name] = sanitize(raw[name]); });
      return store;
    }
    // Migra o tema único da versão anterior para os três escopos.
    var legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null"); } catch (error) { legacy = null; }
    if (legacy && typeof legacy === "object") SCOPES.forEach(function (name) { store[name] = sanitize(legacy); });
    return store;
  }

  var store = loadStore();
  var state = store[scope];

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (error) { /* modo privado */ }
  }

  function apply(theme) {
    var root = document.documentElement.style;
    Object.keys(variableMap).forEach(function (key) {
      var value = theme[key];
      if (key === "blur" || key === "radius") value = value + "px";
      else if (key === "saturate") value = value + "%";
      else if (key === "speed") value = Number(value).toFixed(2) + "s";
      root.setProperty(variableMap[key], String(value));
    });

    root.setProperty("--hattz-color-accent", "rgb(" + theme.tint + ")");
    root.setProperty("--hattz-color-accent-strong", "rgb(" + theme.tint2 + ")");
    root.setProperty("--hattz-color-bg", "rgb(" + theme.bgBase + ")");
    root.setProperty("--hattz-color-text", "rgb(244, 240, 250)");
    root.setProperty("--hattz-color-surface", "rgba(" + theme.surface + ", " + theme.alpha + ")");
    root.setProperty("--hattz-color-border", "rgba(" + theme.border + ", " + theme.borderAlpha + ")");
    root.setProperty("--hattz-glass-bg", "rgba(" + theme.surface + ", " + theme.alpha + ")");
    root.setProperty("--hattz-glass-border", "rgba(" + theme.tint + ", " + theme.borderAlpha + ")");
    root.setProperty("--hattz-glass-blur", theme.blur + "px");
    root.setProperty("--hattz-shadow-panel", "0 22px 70px rgba(0, 0, 0, " + theme.shadow + ")");
    root.setProperty("--hattz-radius-lg", theme.radius + "px");
    root.setProperty("--hattz-radius-xl", Math.round(theme.radius * 1.15) + "px");
    root.setProperty("--hattz-motion-fast", Number(theme.speed).toFixed(2) + "s ease");
  }

  /* Ponte de tema: leva os tokens às superfícies, botões, campos e acentos
     das três aplicações. Injetada em runtime para funcionar em qualquer build. */
  var bridge = [
    "body.capture-mode .hatz-lg-toggle,body.capture-mode .hatz-lg-panel{display:none!important}",
    /* Theme suave: realça o design existente em vez de repintar a interface. */
    ".editor-card,.modal-content,.field-group,.editor-tabs,.badge-library,.music-dock{",
    "  background:linear-gradient(135deg,rgba(255,255,255,calc(var(--lg-sheen-alpha) * .95)),rgba(255,255,255,.015) 38%,",
    "    rgba(var(--lg-tint),.035) 64%,rgba(var(--lg-surface),calc(var(--lg-alpha) * .38)))!important;",
    "  border-color:rgba(var(--lg-border),calc(var(--lg-border-alpha) * .8))!important;",
    "  box-shadow:inset 0 1px rgba(var(--lg-border),var(--lg-highlight-alpha)),0 18px 46px rgba(0,0,0,calc(var(--lg-shadow-alpha) * .55))!important;",
    "  backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate))!important;",
    "  -webkit-backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate))!important}",
    ".field input,.field select,.field textarea,.search-input,.field-group input[type=text]{",
    "  background:rgba(var(--lg-surface),calc(var(--lg-alpha) * .55))!important;",
    "  border-color:rgba(var(--lg-border),var(--lg-border-alpha))!important;",
    "  border-radius:min(13px,calc(var(--lg-radius) * .48))!important;color:rgb(244,240,250)!important}",
    ".field input:focus,.field select:focus,.field textarea:focus,.search-input:focus{",
    "  border-color:rgba(var(--lg-tint),.5)!important;box-shadow:0 0 0 3px rgba(var(--lg-tint),.1)!important;outline:none}",
    ".primary,button.primary,.add-button,.editor-tabs button.active,.studio-nav.active,.nav-item.active{",
    "  background:linear-gradient(135deg,rgba(var(--lg-tint),.9),rgba(var(--lg-tint-2),.7))!important;",
    "  border-color:rgba(var(--lg-tint),.26)!important;color:#fff!important;",
    "  box-shadow:0 8px 24px rgba(var(--lg-tint-2),calc(var(--lg-glow-alpha) * .45)),inset 0 1px rgba(255,255,255,.26)!important}",
    ".eyebrow,.brand-symbol,.hatz-lg-scope{color:rgb(var(--lg-tint))!important}",
    ".brand-symbol,.metric:before,.eyebrow:before{",
    "  background:linear-gradient(145deg,rgba(var(--lg-tint),.9),rgba(var(--lg-tint-2),.75))!important;",
    "  box-shadow:0 6px 18px rgba(var(--lg-tint-2),calc(var(--lg-glow-alpha) * .5))!important}",
    ".blocks-chip,.live-chip,.status-pill,.studio-nav.active,.nav-item.active{",
    "  border-color:rgba(var(--lg-tint),.2)!important;border-radius:999px!important}",
    ".editor-tabs button.active{border-radius:999px!important}",
    ".glass,.studio-top,.editor-card,.sidebar,.login-card,.chart-panel{",
    "  border-radius:min(var(--lg-radius),32px)!important}",
    "input[type=range]{accent-color:rgb(var(--lg-tint))!important}",
    ".ui-icon,.icon-button svg{filter:drop-shadow(0 1px 3px rgba(var(--lg-tint-2),calc(var(--lg-glow-alpha) * .4)))!important}",
    "@media(prefers-reduced-motion:reduce){.hatz-lg-toggle,.hatz-lg-panel{transition:none!important}}"
  ].join("\n");

  var ui = [
    ".hatz-lg-toggle{position:fixed;right:20px;bottom:20px;width:42px;height:42px;display:grid;place-items:center;border-radius:50%;",
    "border:1px solid rgba(255,255,255,.14);background:rgba(16,14,24,.62);color:rgba(var(--lg-tint),.95);cursor:pointer;z-index:9998;",
    "box-shadow:0 8px 28px rgba(0,0,0,.36),inset 0 1px rgba(255,255,255,.12);",
    "backdrop-filter:blur(22px) saturate(160%);-webkit-backdrop-filter:blur(22px) saturate(160%);",
    "transition:transform var(--lg-speed) ease,border-color var(--lg-speed) ease,background var(--lg-speed) ease}",
    ".hatz-lg-toggle:hover{transform:translateY(-2px);border-color:rgba(var(--lg-tint),.42);background:rgba(var(--lg-surface),.72)}",
    ".hatz-lg-toggle[aria-expanded=true]{color:#fff;border-color:rgba(var(--lg-tint),.55);background:linear-gradient(145deg,rgba(var(--lg-tint),.62),rgba(var(--lg-tint-2),.44))}",
    ".hatz-lg-toggle svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
    ".hatz-lg-panel{position:fixed;right:20px;bottom:74px;width:min(318px,calc(100vw - 28px));max-height:calc(100vh - 112px);overflow:auto;padding:18px;",
    "border-radius:22px;border:1px solid rgba(255,255,255,.11);",
    "background:linear-gradient(155deg,rgba(255,255,255,.075),rgba(255,255,255,.015) 42%,rgba(var(--lg-surface),.35)),rgba(13,12,20,.86);",
    "box-shadow:0 26px 70px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.13),inset 0 -1px rgba(255,255,255,.03);",
    "backdrop-filter:blur(30px) saturate(170%);-webkit-backdrop-filter:blur(30px) saturate(170%);",
    "color:#efe9f7;font:12px/1.45 'DM Sans',sans-serif;z-index:9999;scrollbar-width:thin;scrollbar-color:rgba(var(--lg-tint),.35) transparent}",
    ".hatz-lg-panel::-webkit-scrollbar{width:6px}.hatz-lg-panel::-webkit-scrollbar-thumb{background:rgba(var(--lg-tint),.28);border-radius:9px}",
    ".hatz-lg-panel[hidden]{display:none!important}",
    ".hatz-lg-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:13px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:13px}",
    ".hatz-lg-title{display:flex;align-items:center;gap:10px}",
    ".hatz-lg-mark{width:27px;height:27px;border-radius:9px;display:grid;place-items:center;border:1px solid rgba(var(--lg-tint),.24);background:linear-gradient(145deg,rgba(var(--lg-tint),.24),rgba(var(--lg-tint-2),.1))}",
    ".hatz-lg-mark svg{width:14px;height:14px;fill:none;stroke:rgb(var(--lg-tint));stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
    ".hatz-lg-head strong{display:block;font:700 13px Manrope,sans-serif;letter-spacing:-.01em;color:#f6f1fb}",
    ".hatz-lg-scope{display:block;font:700 8px Manrope,sans-serif;letter-spacing:.16em;text-transform:uppercase;opacity:.85;margin-top:1px}",
    ".hatz-lg-close{width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:8px;background:rgba(255,255,255,.05);color:#9d94ab;font-size:17px;line-height:1;cursor:pointer}",
    ".hatz-lg-close:hover{background:rgba(255,255,255,.11);color:#fff}",
    ".hatz-lg-section{margin:15px 0 9px;display:flex;align-items:center;gap:9px;font:700 9px Manrope,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8d849b}",
    ".hatz-lg-section:after{content:'';height:1px;flex:1;background:rgba(255,255,255,.07)}",
    ".hatz-lg-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}",
    ".hatz-lg-preset{display:grid;justify-items:center;gap:5px;padding:0;border:0;background:none;color:#948ba2;cursor:pointer;font:600 9px 'DM Sans',sans-serif}",
    ".hatz-lg-swatch{width:100%;height:27px;border-radius:9px;border:1px solid rgba(255,255,255,.16);box-shadow:inset 0 1px rgba(255,255,255,.2);transition:outline-color var(--lg-speed) ease}",
    ".hatz-lg-preset[data-active=true]{color:#fff}.hatz-lg-preset[data-active=true] .hatz-lg-swatch{outline:1px solid rgb(var(--lg-tint));outline-offset:2px}",
    ".hatz-lg-row{margin:10px 0}",
    ".hatz-lg-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}",
    ".hatz-lg-row label{color:#cbc3d6;font-size:10.5px}",
    ".hatz-lg-row output{color:rgba(var(--lg-tint),.95);font:700 10px ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums}",
    ".hatz-lg-row input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;margin:0;border-radius:99px;cursor:pointer;outline:none;",
    "background:linear-gradient(90deg,rgb(var(--lg-tint)) var(--lg-fill,50%),rgba(255,255,255,.1) var(--lg-fill,50%))}",
    ".hatz-lg-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#fff;border:2px solid rgb(var(--lg-tint));box-shadow:0 2px 8px rgba(0,0,0,.45)}",
    ".hatz-lg-row input[type=range]::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:#fff;border:2px solid rgb(var(--lg-tint));box-shadow:0 2px 8px rgba(0,0,0,.45)}",
    ".hatz-lg-colors{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}",
    ".hatz-lg-color{display:grid;justify-items:center;gap:5px;padding:7px 3px 6px;border:1px solid rgba(255,255,255,.06);border-radius:11px;background:rgba(255,255,255,.025)}",
    ".hatz-lg-color span{font-size:8.5px;line-height:1.1;color:#968da5;text-align:center}",
    ".hatz-lg-color input[type=color]{-webkit-appearance:none;appearance:none;width:24px;height:24px;padding:0;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:transparent;cursor:pointer;overflow:hidden}",
    ".hatz-lg-color input[type=color]::-webkit-color-swatch-wrapper{padding:0}.hatz-lg-color input[type=color]::-webkit-color-swatch{border:0;border-radius:7px}",
    ".hatz-lg-adv{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07)}",
    ".hatz-lg-adv summary{cursor:pointer;list-style:none;color:#8d849b;font:700 9px Manrope,sans-serif;letter-spacing:.14em;text-transform:uppercase}",
    ".hatz-lg-adv summary::-webkit-details-marker{display:none}.hatz-lg-adv summary:before{content:'+ ';color:rgb(var(--lg-tint))}.hatz-lg-adv[open] summary:before{content:'− '}",
    ".hatz-lg-code{width:100%;min-height:62px;resize:vertical;margin-top:9px;padding:9px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.28);color:#d9c7f7;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}",
    ".hatz-lg-mini{display:flex;gap:7px;margin-top:7px}.hatz-lg-mini button{flex:1;border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:7px;background:rgba(255,255,255,.05);color:#cfc6da;cursor:pointer;font:700 9px Manrope,sans-serif}",
    ".hatz-lg-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px}",
    ".hatz-lg-primary{border:1px solid rgba(var(--lg-tint),.3);border-radius:12px;padding:10px 12px;color:#fff;cursor:pointer;font:700 10px Manrope,sans-serif;background:linear-gradient(135deg,rgba(var(--lg-tint),.26),rgba(var(--lg-tint-2),.14))}",
    ".hatz-lg-primary:hover{background:linear-gradient(135deg,rgba(var(--lg-tint),.38),rgba(var(--lg-tint-2),.22))}",
    ".hatz-lg-ghost{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.04);color:#a99fb8;cursor:pointer;font:700 10px Manrope,sans-serif}",
    ".hatz-lg-ghost:hover{background:rgba(255,255,255,.09);color:#fff}",
    "@media(max-width:520px){.hatz-lg-toggle{right:12px;bottom:12px}.hatz-lg-panel{right:12px;bottom:66px;max-height:calc(100vh - 90px)}}"
  ].join("\n");

  var panel, code, toggle, currentPreset = "violeta";

  function updateFill(input) {
    var min = Number(input.min), max = Number(input.max);
    var percent = max > min ? ((Number(input.value) - min) / (max - min)) * 100 : 50;
    input.style.setProperty("--lg-fill", percent.toFixed(1) + "%");
  }

  function render() {
    ranges.forEach(function (item) {
      var key = item[0], factor = item[6];
      var input = panel.querySelector('[data-lg-range="' + key + '"]');
      var output = panel.querySelector('[data-lg-out="' + key + '"]');
      if (input) { input.value = String(Math.round(state[key] * factor)); updateFill(input); }
      if (output) output.textContent = Math.round(state[key] * factor) + item[5];
    });
    colors.forEach(function (item) {
      var input = panel.querySelector('[data-lg-color="' + item[0] + '"]');
      if (input) input.value = rgbToHex(state[item[0]]);
    });
    panel.querySelectorAll("[data-lg-preset]").forEach(function (button) {
      button.dataset.active = String(button.dataset.lgPreset === currentPreset);
    });
    if (code) code.value = JSON.stringify(state);
  }

  function commit() {
    store[scope] = state;
    apply(state);
    save();
    render();
  }

  function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function build() {
    var style = document.createElement("style");
    style.textContent = bridge + "\n" + ui;
    document.head.appendChild(style);

    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "hatz-lg-toggle";
    toggle.setAttribute("aria-label", "Personalizar liquid glass de " + SCOPE_LABELS[scope]);
    toggle.setAttribute("aria-expanded", "false");
    toggle.title = "Personalizar liquid glass — " + SCOPE_LABELS[scope];
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>';
    document.body.appendChild(toggle);

    panel = document.createElement("aside");
    panel.className = "hatz-lg-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Personalizar liquid glass de " + SCOPE_LABELS[scope]);
    panel.hidden = true;

    var html = [
      '<div class="hatz-lg-head"><div class="hatz-lg-title"><span class="hatz-lg-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg></span>',
      '<div><strong>Liquid Glass</strong><span class="hatz-lg-scope">' + SCOPE_LABELS[scope] + '</span></div></div><button class="hatz-lg-close" type="button" aria-label="Fechar">×</button></div>',
      '<div class="hatz-lg-section">Presets</div><div class="hatz-lg-presets">',
      Object.keys(presets).map(function (name) {
        var preset = presets[name];
        var first = preset.tint || defaults.tint;
        var second = preset.tint2 || defaults.tint2;
        return '<button type="button" class="hatz-lg-preset" data-lg-preset="' + name + '" data-active="' + (name === currentPreset) + '" title="' + name + '">' +
          '<span class="hatz-lg-swatch" style="background:linear-gradient(135deg,rgb(' + first + '),rgb(' + second + '))"></span>' +
          name[0].toUpperCase() + name.slice(1) + '</button>';
      }).join(""),
      '</div><div class="hatz-lg-section">Superfície e efeitos</div>'
    ];
    ranges.forEach(function (item) {
      html.push('<div class="hatz-lg-row"><div class="hatz-lg-meta"><label for="lg-' + item[0] + '">' + item[1] + '</label><output data-lg-out="' + item[0] + '"></output></div><input id="lg-' + item[0] + '" data-lg-range="' + item[0] + '" type="range" min="' + item[2] + '" max="' + item[3] + '" step="' + item[4] + '"></div>');
    });
    html.push('<div class="hatz-lg-section">Cores</div><div class="hatz-lg-colors">');
    colors.forEach(function (item) {
      html.push('<label class="hatz-lg-color"><input data-lg-color="' + item[0] + '" type="color"><span>' + item[1] + '</span></label>');
    });
    html.push('</div><details class="hatz-lg-adv"><summary>Código do tema</summary><textarea class="hatz-lg-code" spellcheck="false" aria-label="Código JSON do tema"></textarea>');
    html.push('<div class="hatz-lg-mini"><button type="button" data-lg-action="copy">Copiar</button><button type="button" data-lg-action="paste">Aplicar código</button></div></details>');
    html.push('<div class="hatz-lg-actions"><button type="button" class="hatz-lg-primary" data-lg-action="all">Aplicar a todos</button><button type="button" class="hatz-lg-ghost" data-lg-action="reset">Resetar</button></div>');
    panel.innerHTML = html.join("");
    document.body.appendChild(panel);
    code = panel.querySelector(".hatz-lg-code");

    toggle.addEventListener("click", function () {
      if (document.body.classList.contains("capture-mode")) return;
      var open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) render();
    });
    panel.querySelector(".hatz-lg-close").addEventListener("click", closePanel);

    panel.addEventListener("input", function (event) {
      var target = event.target;
      if (target.dataset.lgRange) {
        var range = ranges.filter(function (item) { return item[0] === target.dataset.lgRange; })[0];
        state[range[0]] = Number(target.value) / range[6];
        currentPreset = null;
        updateFill(target);
        apply(state);
        var output = panel.querySelector('[data-lg-out="' + range[0] + '"]');
        if (output) output.textContent = Math.round(state[range[0]] * range[6]) + range[5];
        panel.querySelectorAll("[data-lg-preset]").forEach(function (button) { button.dataset.active = "false"; });
        if (code) code.value = JSON.stringify(state);
        store[scope] = state;
        save();
      } else if (target.dataset.lgColor) {
        var rgb = hexToRgb(target.value);
        if (rgb) { currentPreset = null; state[target.dataset.lgColor] = rgb; commit(); }
      }
    });

    panel.addEventListener("click", function (event) {
      var preset = event.target.dataset && event.target.dataset.lgPreset;
      if (preset) {
        currentPreset = preset;
        state = sanitize(presets[preset]);
        commit();
        return;
      }
      var action = event.target.dataset && event.target.dataset.lgAction;
      if (action === "reset") { currentPreset = "violeta"; state = clone(defaults); commit(); }
      if (action === "all") {
        SCOPES.forEach(function (name) { store[name] = clone(state); });
        save();
        buttonFeedback(event.target, "Aplicado");
      }
      if (action === "copy") {
        var text = JSON.stringify(state);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
        if (code) { code.value = text; code.focus(); code.select(); }
      }
      if (action === "paste") {
        try {
          var parsed = JSON.parse(code.value);
          currentPreset = null;
          state = sanitize(parsed);
          commit();
        } catch (error) {
          code.value = "JSON inválido: " + error.message;
        }
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) closePanel();
    });

    if (window.MutationObserver) {
      new MutationObserver(function () {
        if (document.body.classList.contains("capture-mode")) closePanel();
      }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    if (document.body.classList.contains("capture-mode")) closePanel();
  }

  /* Voltar ao topo: mesmo vidro do personalizador, sem aparecer na captura. */
  function buildToTop() {
    if (document.querySelector(".hatz-to-top")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "hatz-to-top";
    button.setAttribute("aria-label", "Voltar ao topo");
    button.title = "Voltar ao topo";
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
    button.addEventListener("click", function () {
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
    document.body.appendChild(button);
    var update = function () {
      var hidden = document.body.classList.contains("capture-mode") || window.scrollY < 360;
      button.classList.toggle("is-visible", !hidden);
    };
    window.addEventListener("scroll", update, { passive: true });
    if (window.MutationObserver) new MutationObserver(update).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    update();
  }

  function buttonFeedback(button, text) {
    var original = button.textContent;
    button.textContent = text;
    setTimeout(function () { button.textContent = original; }, 1200);
  }

  window.HattzLiquidGlass = {
    scope: scope,
    get: function (target) { return clone(target ? store[target] : state); },
    getStore: function () { return clone(store); },
    set: function (partial, target) {
      var name = target || scope;
      Object.keys(partial || {}).forEach(function (key) { if (key in defaults) store[name][key] = partial[key]; });
      if (name === scope) { state = store[name]; apply(state); if (panel) render(); }
      save();
    },
    reset: function (target) {
      var name = target || scope;
      store[name] = clone(defaults);
      if (name === scope) { state = store[name]; apply(state); if (panel) render(); }
      save();
    },
    apply: function () { apply(state); },
    applyToAll: function () { SCOPES.forEach(function (name) { store[name] = clone(state); }); save(); }
  };

  apply(state);
  function ready() { build(); buildToTop(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
})();
