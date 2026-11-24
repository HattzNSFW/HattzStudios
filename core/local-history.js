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

  function getStack(key) {
    const id = String(key || "geral");
    if (!stacks.has(id)) stacks.set(id, { past: [], present: undefined, future: [], at: 0 });
    return stacks.get(id);
  }

  function push(key, value, options = {}) {
    const stack = getStack(key);
    const snapshot = clone(value);
    const sig = signature(snapshot);
    if (sig === signature(stack.present)) return false;

    const now = Date.now();
    const coalesceMs = Math.max(0, Number(options.coalesceMs) || 0);
    if (coalesceMs && stack.present !== undefined && now - stack.at < coalesceMs) {
      stack.present = snapshot;
      stack.at = now;
      return false;
    }

    if (stack.present !== undefined) {
      stack.past.push(clone(stack.present));
      if (stack.past.length > LIMIT) stack.past.shift();
    }
    stack.present = snapshot;
    stack.future.length = 0;
    stack.at = now;
    return true;
  }

  function undo(key) {
    const stack = getStack(key);
    if (!stack.past.length) return null;
    stack.future.unshift(stack.present);
    if (stack.future.length > LIMIT) stack.future.pop();
    stack.present = stack.past.pop();
    stack.at = 0;
    return clone(stack.present);
  }

  function redo(key) {
    const stack = getStack(key);
    if (!stack.future.length) return null;
    stack.past.push(stack.present);
    if (stack.past.length > LIMIT) stack.past.shift();
    stack.present = stack.future.shift();
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
