/* Hättz Liquid Glass — personalizador global de aparência.
   Funciona no Share, Studio e Control sem dependências externas. */
(function () {
  "use strict";

  var KEY = "hattz_liquid_glass_v1";
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

  var variableMap = {
    tint: "--lg-tint", tint2: "--lg-tint-2", cyan: "--lg-cyan",
    surface: "--lg-surface", border: "--lg-border",
    bgBase: "--lg-bg-base", bgA: "--lg-bg-a", bgB: "--lg-bg-b", bgC: "--lg-bg-c",
    alpha: "--lg-alpha", borderAlpha: "--lg-border-alpha",
    highlight: "--lg-highlight-alpha", sheen: "--lg-sheen-alpha",
    glow: "--lg-glow-alpha", shadow: "--lg-shadow-alpha",
    blur: "--lg-blur", saturate: "--lg-saturate", radius: "--lg-radius", speed: "--lg-speed"
  };

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

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

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

  function load() {
    var stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (error) { stored = {}; }
    var theme = clone(defaults);
    Object.keys(defaults).forEach(function (key) {
      if (stored[key] === undefined) return;
      var value = stored[key];
      if (typeof defaults[key] === "number") {
        var parsed = Number(value);
        if (isFinite(parsed)) theme[key] = parsed;
      } else if (typeof value === "string" && /^\d{1,3}, \d{1,3}, \d{1,3}$/.test(value)) {
        theme[key] = value;
      }
    });
    return theme;
  }

  function save(theme) {
    try { localStorage.setItem(KEY, JSON.stringify(theme)); } catch (error) { /* modo privado */ }
  }

  function apply(theme) {
    var root = document.documentElement.style;
    Object.keys(variableMap).forEach(function (key) {
      var value = theme[key];
      if (variableMap[key].indexOf("blur") >= 0 || variableMap[key] === "--lg-blur") value = value + "px";
      else if (variableMap[key] === "--lg-saturate") value = value + "%";
      else if (variableMap[key] === "--lg-speed") value = Number(value).toFixed(2) + "s";
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

  var css = [
    ".hatz-lg-toggle{position:fixed;right:22px;bottom:22px;width:54px;height:54px;display:grid;place-items:center;border-radius:18px;border:1px solid rgba(255,255,255,.22);background:linear-gradient(145deg,rgba(var(--lg-tint),.9),rgba(var(--lg-tint-2),.72));color:#fff;cursor:pointer;z-index:9998;box-shadow:0 14px 34px rgba(var(--lg-tint-2),var(--lg-glow-alpha)),inset 0 1px rgba(255,255,255,.45);backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate));transition:transform var(--lg-speed) ease,box-shadow var(--lg-speed) ease}",
    ".hatz-lg-toggle:hover{transform:translateY(-3px) rotate(-4deg);box-shadow:0 20px 46px rgba(var(--lg-tint-2),.55),inset 0 1px rgba(255,255,255,.5)}",
    ".hatz-lg-toggle svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
    ".hatz-lg-panel{position:fixed;right:22px;bottom:88px;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 120px);overflow:auto;padding:20px;border-radius:var(--lg-radius);border:1px solid rgba(var(--lg-border),var(--lg-border-alpha));background:linear-gradient(135deg,rgba(255,255,255,var(--lg-sheen-alpha)),rgba(255,255,255,.02) 34%,rgba(255,255,255,0) 62%),linear-gradient(160deg,rgba(var(--lg-surface),calc(var(--lg-alpha) + .18)),rgba(var(--lg-bg-base),calc(var(--lg-alpha) + .1)));box-shadow:0 26px 70px rgba(0,0,0,var(--lg-shadow-alpha)),inset 0 1px rgba(255,255,255,var(--lg-highlight-alpha));backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate));-webkit-backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate));color:#f4f0fa;font:12px/1.5 var(--hattz-font-sans,'DM Sans',sans-serif);z-index:9999}",
    ".hatz-lg-panel[hidden]{display:none!important}",
    ".hatz-lg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}",
    ".hatz-lg-head strong{display:block;font:800 16px Manrope,sans-serif;letter-spacing:-.03em}",
    ".hatz-lg-head small{color:rgba(var(--lg-tint),.9);letter-spacing:.16em;font:700 8px Manrope,sans-serif;text-transform:uppercase}",
    ".hatz-lg-close{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:10px;width:28px;height:28px;cursor:pointer}",
    ".hatz-lg-section{margin:16px 0 8px;font:800 9px Manrope,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:rgba(var(--lg-tint),.85)}",
    ".hatz-lg-row{display:grid;grid-template-columns:1fr auto;gap:4px 10px;margin:10px 0}",
    ".hatz-lg-row label{color:#d7cee5;font-size:11px}",
    ".hatz-lg-row output{color:#fff;font-weight:700;font-variant-numeric:tabular-nums;font-size:11px}",
    ".hatz-lg-row input[type=range]{grid-column:1/-1;width:100%;accent-color:rgb(var(--lg-tint));cursor:pointer}",
    ".hatz-lg-colors{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
    ".hatz-lg-colors label{display:grid;gap:5px;color:#c9bfd8;font-size:10px;text-align:center}",
    ".hatz-lg-colors input[type=color]{width:100%;height:32px;padding:2px;border:1px solid rgba(255,255,255,.16);border-radius:9px;background:rgba(0,0,0,.25);cursor:pointer}",
    ".hatz-lg-presets{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}",
    ".hatz-lg-presets button{border:1px solid rgba(var(--lg-tint),.28);background:rgba(var(--lg-tint),.1);color:#eadcff;border-radius:99px;padding:6px 11px;cursor:pointer;font-size:10px;font-weight:700}",
    ".hatz-lg-presets button:hover{background:rgba(var(--lg-tint),.22)}",
    ".hatz-lg-code{width:100%;min-height:58px;resize:vertical;margin-top:8px;padding:9px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.3);color:#d9c7f7;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace}",
    ".hatz-lg-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}",
    ".hatz-lg-actions button{flex:1 1 auto;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#fff;border-radius:10px;padding:9px 10px;cursor:pointer;font-size:10px;font-weight:700}",
    ".hatz-lg-actions button:first-child{border-color:rgba(var(--lg-tint),.4);background:rgba(var(--lg-tint),.18)}",
    ".hatz-lg-note{color:#9c92ad;font-size:10px;margin:10px 0 0}",
    "@media(max-width:520px){.hatz-lg-toggle{right:12px;bottom:12px}.hatz-lg-panel{right:12px;bottom:76px;max-height:calc(100vh - 100px)}}",
    "@media(prefers-reduced-motion:reduce){.hatz-lg-toggle,.hatz-lg-panel{transition:none!important}}"
  ].join("\n");

  var state = load();
  var panel, code, toggle;

  function render() {
    ranges.forEach(function (item) {
      var key = item[0], factor = item[6];
      var input = panel.querySelector('[data-lg-range="' + key + '"]');
      var output = panel.querySelector('[data-lg-out="' + key + '"]');
      if (input) input.value = String(Math.round(state[key] * factor));
      if (output) output.textContent = Math.round(state[key] * factor) + item[5];
    });
    colors.forEach(function (item) {
      var input = panel.querySelector('[data-lg-color="' + item[0] + '"]');
      if (input) input.value = rgbToHex(state[item[0]]);
    });
    if (code) code.value = JSON.stringify(state);
  }

  function commit() {
    apply(state);
    save(state);
    render();
  }

  function build() {
    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "hatz-lg-toggle";
    toggle.setAttribute("aria-label", "Personalizar liquid glass");
    toggle.title = "Personalizar liquid glass";
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.7c3.6 4.2 6 7.3 6 10.6a6 6 0 0 1-12 0c0-3.3 2.4-6.4 6-10.6Z"/><path d="M9 15.5c.3 1.4 1.3 2.3 2.8 2.6"/></svg>';
    document.body.appendChild(toggle);

    panel = document.createElement("aside");
    panel.className = "hatz-lg-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Personalizar liquid glass");
    panel.hidden = true;

    var html = [
      '<div class="hatz-lg-head"><div><small>HÄTTZ APPEARANCE</small><strong>Liquid Glass</strong></div><button class="hatz-lg-close" type="button" aria-label="Fechar">×</button></div>',
      '<div class="hatz-lg-section">Presets</div><div class="hatz-lg-presets">',
      Object.keys(presets).map(function (name) { return '<button type="button" data-lg-preset="' + name + '">' + name[0].toUpperCase() + name.slice(1) + '</button>'; }).join(""),
      '</div><div class="hatz-lg-section">Superfície e efeitos</div>'
    ];
    ranges.forEach(function (item) {
      html.push('<div class="hatz-lg-row"><label for="lg-' + item[0] + '">' + item[1] + '</label><output data-lg-out="' + item[0] + '"></output><input id="lg-' + item[0] + '" data-lg-range="' + item[0] + '" type="range" min="' + item[2] + '" max="' + item[3] + '" step="' + item[4] + '"></div>');
    });
    html.push('<div class="hatz-lg-section">Cores</div><div class="hatz-lg-colors">');
    colors.forEach(function (item) {
      html.push('<label>' + item[1] + '<input data-lg-color="' + item[0] + '" type="color"></label>');
    });
    html.push('</div><div class="hatz-lg-section">Código do tema</div><textarea class="hatz-lg-code" spellcheck="false" aria-label="Código JSON do tema"></textarea>');
    html.push('<div class="hatz-lg-actions"><button type="button" data-lg-action="reset">Resetar</button><button type="button" data-lg-action="copy">Copiar</button><button type="button" data-lg-action="paste">Aplicar código</button></div>');
    html.push('<p class="hatz-lg-note">As mudanças são salvas neste navegador e valem para Share, Studio e Control.</p>');
    panel.innerHTML = html.join("");
    document.body.appendChild(panel);
    code = panel.querySelector(".hatz-lg-code");

    toggle.addEventListener("click", function () { panel.hidden = !panel.hidden; if (!panel.hidden) render(); });
    panel.querySelector(".hatz-lg-close").addEventListener("click", function () { panel.hidden = true; });

    panel.addEventListener("input", function (event) {
      var target = event.target;
      if (target.dataset.lgRange) {
        var range = ranges.filter(function (item) { return item[0] === target.dataset.lgRange; })[0];
        state[range[0]] = Number(target.value) / range[6];
        if (range[0] === "alpha" || range[0] === "borderAlpha" || range[0] === "highlight" || range[0] === "sheen" || range[0] === "glow" || range[0] === "shadow") {
          state[range[0]] = clamp(state[range[0]], 0, 1);
        }
        apply(state);
        var output = panel.querySelector('[data-lg-out="' + range[0] + '"]');
        if (output) output.textContent = Math.round(state[range[0]] * range[6]) + range[5];
        if (code) code.value = JSON.stringify(state);
        save(state);
      } else if (target.dataset.lgColor) {
        var rgb = hexToRgb(target.value);
        if (rgb) { state[target.dataset.lgColor] = rgb; commit(); }
      }
    });

    panel.addEventListener("click", function (event) {
      var preset = event.target.dataset && event.target.dataset.lgPreset;
      if (preset) {
        var next = clone(defaults);
        Object.keys(presets[preset]).forEach(function (key) { next[key] = presets[preset][key]; });
        state = next;
        commit();
        return;
      }
      var action = event.target.dataset && event.target.dataset.lgAction;
      if (action === "reset") { state = clone(defaults); commit(); }
      if (action === "copy") {
        var text = JSON.stringify(state);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
        if (code) { code.value = text; code.focus(); code.select(); }
      }
      if (action === "paste") {
        try {
          var parsed = JSON.parse(code.value);
          var nextTheme = clone(state);
          Object.keys(parsed).forEach(function (key) {
            if (!(key in defaults)) return;
            if (typeof defaults[key] === "number") {
              var n = Number(parsed[key]);
              if (isFinite(n)) nextTheme[key] = n;
            } else if (/^\d{1,3}, \d{1,3}, \d{1,3}$/.test(parsed[key])) {
              nextTheme[key] = parsed[key];
            }
          });
          state = nextTheme;
          commit();
        } catch (error) {
          code.value = "JSON inválido: " + error.message;
        }
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) panel.hidden = true;
    });
  }

  window.HattzLiquidGlass = {
    get: function () { return clone(state); },
    set: function (partial) {
      Object.keys(partial || {}).forEach(function (key) { if (key in defaults) state[key] = partial[key]; });
      commit();
    },
    reset: function () { state = clone(defaults); commit(); },
    apply: function () { apply(state); }
  };

  apply(state);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
