/* Hättz Liquid Glass — personalizador independente por tela.
   Share, Studio e Control têm temas próprios; a ponte de tema abaixo
   leva os tokens --lg-* para toda a interface, sem dependências. */
(function () {
  "use strict";

  var KEY = "hattz_liquid_glass_v2";
  var LEGACY_KEY = "hattz_liquid_glass_v1";
  var SCOPES = ["share", "studio", "control"];
  var SCOPE_LABELS = { share: "SHARE", studio: "STUDIO", control: "CONTROL" };

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
    var path = (window.location.pathname || "").toLowerCase();
    if (path.indexOf("control") >= 0) return "control";
    if (path.indexOf("studio") >= 0) return "studio";
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
    ".hatz-lg-scope{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(var(--lg-tint),.3)!important;background:rgba(var(--lg-tint),.1)!important;border-radius:99px;padding:4px 9px;color:rgb(var(--lg-tint))!important;font:800 8px Manrope,sans-serif;letter-spacing:.16em}",
    ".hatz-lg-scope i{width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}",
    /* Share: chrome do editor (não mexe no conteúdo do perfil) */
    ".editor-card,.modal-content,.field-group,.content-section,.editor-tabs,.badge-library,.music-dock,.panel{",
    "  background:linear-gradient(135deg,rgba(255,255,255,var(--lg-sheen-alpha)),rgba(255,255,255,calc(var(--lg-sheen-alpha)*.17)) 34%,rgba(255,255,255,0) 62%),",
    "    linear-gradient(160deg,rgba(var(--lg-surface),calc(var(--lg-alpha) + .08)),rgba(var(--lg-bg-base),calc(var(--lg-alpha) + .04)))!important;",
    "  border:1px solid rgba(var(--lg-border),var(--lg-border-alpha))!important;border-radius:var(--lg-radius)!important;",
    "  box-shadow:0 26px 70px rgba(0,0,0,var(--lg-shadow-alpha)),inset 0 1px rgba(var(--lg-border),var(--lg-highlight-alpha))!important;",
    "  backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate))!important;",
    "  -webkit-backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate))!important}",
    ".field input,.field select,.field textarea,.search-input,.field-group input[type=text]{",
    "  background:rgba(var(--lg-surface),calc(var(--lg-alpha) + .2))!important;",
    "  border:1px solid rgba(var(--lg-border),var(--lg-border-alpha))!important;",
    "  border-radius:calc(var(--lg-radius) * .45)!important;color:rgb(244,240,250)!important}",
    ".field input:focus,.field select:focus,.field textarea:focus,.search-input:focus{",
    "  border-color:rgba(var(--lg-tint),.6)!important;box-shadow:0 0 0 3px rgba(var(--lg-tint),.12)!important;outline:none}",
    /* Acentos em todas as telas */
    ".primary,button.primary,.add-button,.editor-tabs button.active,.studio-nav.active,.nav-item.active{",
    "  background:linear-gradient(135deg,rgb(var(--lg-tint)),rgb(var(--lg-tint-2)))!important;",
    "  border-color:rgba(var(--lg-tint),.32)!important;color:#fff!important;",
    "  box-shadow:0 10px 26px rgba(var(--lg-tint-2),var(--lg-glow-alpha)),inset 0 1px rgba(255,255,255,.42)!important}",
    ".eyebrow,.editor-section-title,.field-group>strong,.heading h1,.brand b,.brand-symbol,.blocks-chip,.live-chip,.status-pill{",
    "  color:rgb(var(--lg-tint))!important}",
    ".heading h1{background:none!important;-webkit-text-fill-color:rgb(var(--lg-tint))!important}",
    ".brand-symbol,.metric:before,.eyebrow:before{",
    "  background:linear-gradient(145deg,rgb(var(--lg-tint)),rgb(var(--lg-tint-2)))!important;",
    "  color:#fff!important;box-shadow:0 8px 22px rgba(var(--lg-tint-2),var(--lg-glow-alpha))!important}",
    ".blocks-chip,.live-chip,.status-pill,.studio-nav.active,.nav-item.active,.metric{",
    "  border-color:rgba(var(--lg-tint),.24)!important;",
    "  background:linear-gradient(105deg,rgba(var(--lg-tint),.18),rgba(var(--lg-tint-2),.06))!important}",
    "input[type=range]{accent-color:rgb(var(--lg-tint))!important}",
    ".ui-icon,.icon-button svg{filter:drop-shadow(0 1px 4px rgba(var(--lg-tint-2),var(--lg-glow-alpha)))!important}",
    "@media(prefers-reduced-motion:reduce){.hatz-lg-toggle,.hatz-lg-panel{transition:none!important}}"
  ].join("\n");

  var ui = [
    ".hatz-lg-toggle{position:fixed;right:22px;bottom:22px;width:52px;height:52px;display:grid;place-items:center;border-radius:17px;",
    "border:1px solid rgba(var(--lg-border),calc(var(--lg-border-alpha) + .12));",
    "background:linear-gradient(145deg,rgba(var(--lg-tint),.92),rgba(var(--lg-tint-2),.68));color:#fff;cursor:pointer;z-index:9998;",
    "box-shadow:0 14px 34px rgba(var(--lg-tint-2),var(--lg-glow-alpha)),inset 0 1px rgba(255,255,255,.5),inset 0 -1px rgba(0,0,0,.18);",
    "backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate));-webkit-backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate));",
    "transition:transform var(--lg-speed) ease,box-shadow var(--lg-speed) ease}",
    ".hatz-lg-toggle:hover{transform:translateY(-3px);box-shadow:0 20px 46px rgba(var(--lg-tint-2),.55),inset 0 1px rgba(255,255,255,.6)}",
    ".hatz-lg-toggle[aria-expanded=true]{transform:rotate(90deg)}",
    ".hatz-lg-toggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 3px rgba(0,0,0,.28))}",
    ".hatz-lg-panel{position:fixed;right:22px;bottom:86px;width:min(360px,calc(100vw - 32px));max-height:calc(100vh - 120px);overflow:auto;padding:20px;",
    "border-radius:var(--lg-radius);border:1px solid rgba(var(--lg-border),var(--lg-border-alpha));",
    "background:linear-gradient(135deg,rgba(255,255,255,var(--lg-sheen-alpha)),rgba(255,255,255,.02) 34%,rgba(255,255,255,0) 62%),",
    "linear-gradient(160deg,rgba(var(--lg-surface),calc(var(--lg-alpha) + .18)),rgba(var(--lg-bg-base),calc(var(--lg-alpha) + .1)));",
    "box-shadow:0 26px 70px rgba(0,0,0,var(--lg-shadow-alpha)),inset 0 1px rgba(var(--lg-border),var(--lg-highlight-alpha));",
    "backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate));-webkit-backdrop-filter:blur(var(--lg-blur)) saturate(var(--lg-saturate));",
    "color:#f4f0fa;font:12px/1.5 var(--hattz-font-sans,'DM Sans',sans-serif);z-index:9999}",
    ".hatz-lg-panel[hidden]{display:none!important}",
    ".hatz-lg-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}",
    ".hatz-lg-head strong{display:block;font:800 16px Manrope,sans-serif;letter-spacing:-.03em}",
    ".hatz-lg-head small{color:rgba(var(--lg-tint),.9);letter-spacing:.16em;font:700 8px Manrope,sans-serif;text-transform:uppercase}",
    ".hatz-lg-close{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;border-radius:10px;width:28px;height:28px;cursor:pointer}",
    ".hatz-lg-section{margin:16px 0 8px;font:800 9px Manrope,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:rgba(var(--lg-tint),.85)}",
    ".hatz-lg-row{display:grid;grid-template-columns:1fr auto;gap:4px 10px;margin:10px 0}",
    ".hatz-lg-row label{color:#d7cee5;font-size:11px}",
    ".hatz-lg-row output{color:#fff;font-weight:700;font-variant-numeric:tabular-nums;font-size:11px}",
    ".hatz-lg-row input[type=range]{grid-column:1/-1;width:100%;accent-color:rgb(var(--lg-tint));cursor:pointer;filter:none}",
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
    "@media(max-width:520px){.hatz-lg-toggle{right:12px;bottom:12px}.hatz-lg-panel{right:12px;bottom:76px;max-height:calc(100vh - 100px)}}"
  ].join("\n");

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
      '<div class="hatz-lg-head"><div><span class="hatz-lg-scope"><i></i>' + SCOPE_LABELS[scope] + '</span><strong>Liquid Glass</strong></div><button class="hatz-lg-close" type="button" aria-label="Fechar">×</button></div>',
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
    html.push('<div class="hatz-lg-actions"><button type="button" data-lg-action="all">Aplicar a todos</button><button type="button" data-lg-action="reset">Resetar</button><button type="button" data-lg-action="copy">Copiar</button><button type="button" data-lg-action="paste">Aplicar código</button></div>');
    html.push('<p class="hatz-lg-note">Este tema é exclusivo de ' + SCOPE_LABELS[scope] + '. Use “Aplicar a todos” para igualar Share, Studio e Control.</p>');
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
        apply(state);
        var output = panel.querySelector('[data-lg-out="' + range[0] + '"]');
        if (output) output.textContent = Math.round(state[range[0]] * range[6]) + range[5];
        if (code) code.value = JSON.stringify(state);
        store[scope] = state;
        save();
      } else if (target.dataset.lgColor) {
        var rgb = hexToRgb(target.value);
        if (rgb) { state[target.dataset.lgColor] = rgb; commit(); }
      }
    });

    panel.addEventListener("click", function (event) {
      var preset = event.target.dataset && event.target.dataset.lgPreset;
      if (preset) {
        state = sanitize(presets[preset]);
        commit();
        return;
      }
      var action = event.target.dataset && event.target.dataset.lgAction;
      if (action === "reset") { state = clone(defaults); commit(); }
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
