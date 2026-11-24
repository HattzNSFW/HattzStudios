/* Hättz 2.0 — histórico local e rascunhos de sessão.
   Sem rede, sem rastreamento e sem gravação de mídia binária. */
(() => {
  "use strict";

  const LIMIT = 20;
  const stacks = new Map();
  const handlers = new Set();
  let shortcutInstalled = false;

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function signature(value) {
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  function defaultLabel(key) {
    const id = String(key || "geral");
    if (id.startsWith("profile:")) return "Perfil alterado";
    if (id.startsWith("studio:")) return "Studio alterado";
    if (id.startsWith("liquid:")) return "Tema alterado";
    return "Alteração local";
  }

  function meta(label, at) {
    return { label: String(label || defaultLabel("geral")), at: Number(at) || Date.now() };
  }

  function getStack(key) {
    const id = String(key || "geral");
    if (!stacks.has(id)) {
      stacks.set(id, {
        past: [], present: undefined, future: [],
        metaPast: [], metaPresent: meta(defaultLabel(id)), metaFuture: [],
        at: 0
      });
    }
    return stacks.get(id);
  }

  function push(key, value, options = {}) {
    const stack = getStack(key);
    const snapshot = clone(value);
    const sig = signature(snapshot);
    if (sig === signature(stack.present)) return false;

    const now = Date.now();
    const coalesceMs = Math.max(0, Number(options.coalesceMs) || 0);
    const entry = meta(options.label || defaultLabel(key), now);
    // O primeiro push após semear/undo/redo sempre cria um ponto restaurável.
    // Coalesce só substitui o estado atual de uma sequência rápida já iniciada.
    if (coalesceMs && stack.present !== undefined && stack.past.length > 0 && now - stack.at < coalesceMs) {
      stack.present = snapshot;
      stack.metaPresent = entry;
      stack.future.length = 0;
      stack.metaFuture.length = 0;
      stack.at = now;
      return false;
    }

    if (stack.present !== undefined) {
      stack.past.push(clone(stack.present));
      stack.metaPast.push(stack.metaPresent);
      if (stack.past.length > LIMIT) {
        stack.past.shift();
        stack.metaPast.shift();
      }
    }
    stack.present = snapshot;
    stack.metaPresent = entry;
    stack.future.length = 0;
    stack.metaFuture.length = 0;
    stack.at = now;
    return true;
  }

  function undo(key) {
    const stack = getStack(key);
    if (!stack.past.length) return null;
    stack.future.unshift(stack.present);
    stack.metaFuture.unshift(stack.metaPresent);
    if (stack.future.length > LIMIT) {
      stack.future.pop();
      stack.metaFuture.pop();
    }
    stack.present = stack.past.pop();
    stack.metaPresent = stack.metaPast.pop() || meta(defaultLabel(key));
    stack.at = 0;
    return clone(stack.present);
  }

  function redo(key) {
    const stack = getStack(key);
    if (!stack.future.length) return null;
    stack.past.push(stack.present);
    stack.metaPast.push(stack.metaPresent);
    if (stack.past.length > LIMIT) {
      stack.past.shift();
      stack.metaPast.shift();
    }
    stack.present = stack.future.shift();
    stack.metaPresent = stack.metaFuture.shift() || meta(defaultLabel(key));
    stack.at = 0;
    return clone(stack.present);
  }

  function timeline(key) {
    const stack = getStack(key);
    const pastCount = stack.past.length;
    const values = [...stack.past, stack.present, ...stack.future];
    const metas = [...stack.metaPast, stack.metaPresent, ...stack.metaFuture];
    return values.map((value, index) => ({
      index,
      label: (metas[index] || {}).label || defaultLabel(key),
      at: (metas[index] || {}).at || 0,
      current: index === pastCount,
      available: index <= pastCount
    })).reverse();
  }

  function jump(key, index) {
    const stack = getStack(key);
    const values = [...stack.past, stack.present, ...stack.future];
    const metas = [...stack.metaPast, stack.metaPresent, ...stack.metaFuture];
    const target = Number(index);
    if (!values.length || !Number.isInteger(target) || target < 0 || target >= values.length) return null;
    stack.past = values.slice(0, target);
    stack.metaPast = metas.slice(0, target);
    stack.present = values[target];
    stack.metaPresent = metas[target] || meta(defaultLabel(key));
    stack.future = values.slice(target + 1);
    stack.metaFuture = metas.slice(target + 1);
    stack.at = 0;
    return clone(stack.present);
  }

  const canUndo = (key) => getStack(key).past.length > 0;
  const canRedo = (key) => getStack(key).future.length > 0;
  const draftKey = (key) => `hattz2:draft:${String(key || "geral")}`;

  function saveDraft(key, values) {
    try {
      sessionStorage.setItem(draftKey(key), JSON.stringify({ savedAt: Date.now(), values: clone(values) }));
      return true;
    } catch { return false; }
  }

  function restoreDraft(key) {
    try {
      const raw = sessionStorage.getItem(draftKey(key));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || !data.values) return null;
      return { savedAt: Number(data.savedAt) || 0, values: clone(data.values) };
    } catch { return null; }
  }

  function clearDraft(key) {
    try { sessionStorage.removeItem(draftKey(key)); return true; } catch { return false; }
  }

  function installShortcut() {
    if (shortcutInstalled || typeof document === "undefined") return;
    shortcutInstalled = true;
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = String(event.key || "").toLowerCase();
      if (key !== "z" && key !== "y") return;

      const target = event.target;
      if (target?.isContentEditable || target?.closest?.("input, textarea, select, [contenteditable]")) return;

      const isRedo = key === "y" || event.shiftKey;
      const ordered = [...handlers].sort((a, b) => b.priority - a.priority);
      for (const handler of ordered) {
        let active = false;
        try { active = handler.isActive(); } catch {}
        if (!active) continue;
        const callback = isRedo ? handler.onRedo : handler.onUndo;
        if (typeof callback !== "function") continue;
        let handled = true;
        try { handled = callback() !== false; } catch {}
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
    });
  }

  function bindShortcut(options = {}) {
    if (typeof options.onUndo !== "function" && typeof options.onRedo !== "function") return () => {};
    const handler = {
      isActive: typeof options.isActive === "function" ? options.isActive : () => true,
      onUndo: typeof options.onUndo === "function" ? options.onUndo : null,
      onRedo: typeof options.onRedo === "function" ? options.onRedo : null,
      priority: Number(options.priority) || 0
    };
    handlers.add(handler);
    installShortcut();
    return () => handlers.delete(handler);
  }

  const api = Object.freeze({
    push,
    undo,
    redo,
    timeline,
    jump,
    canUndo,
    canRedo,
    saveDraft,
    restoreDraft,
    clearDraft,
    bindShortcut
  });

  if (typeof window !== "undefined") window.HATTZ_HISTORY = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
