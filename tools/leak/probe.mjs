// A leak probe that works the same in Chromium, Firefox and WebKit, which only Chromium lets a script read the heap of. It counts the things an
// editor that is destroyed must give back, and a test compares the counts before and after many creations and destructions:
//   - event listeners left on the long-lived targets (window, document, <html>, <body>, <head>): a listener on a removed element dies with it
//   - observers still watching something that is on the page
//   - timers, intervals, animation frames and idle callbacks still pending
//   - elements in the document, and style sheets adopted by it
// It is a string, to be given to `context.addInitScript` so it runs before the page's own scripts and sees every call.
export const probeScript = `(() => {
  if (window.__probe) return;
  const longLived = (t) => t === window || t === document || t === document.documentElement || t === document.body || t === document.head;
  const names = new WeakMap();
  let serial = 0;
  const idOf = (fn) => { if (fn === null || (typeof fn !== "function" && typeof fn !== "object")) return 0; if (!names.has(fn)) names.set(fn, ++serial); return names.get(fn); };
  const where = (t) => (t === window ? "window" : t === document ? "document" : t.nodeName);
  const listeners = new Set();
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const capture = (o) => (typeof o === "boolean" ? o : !!(o && o.capture));
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    if (longLived(this) && fn && !(o && typeof o === "object" && o.once)) {
      const key = where(this) + "|" + type + "|" + idOf(fn) + "|" + capture(o);
      listeners.add(key);
      const signal = o && typeof o === "object" ? o.signal : undefined;
      if (signal) add.call(signal, "abort", () => listeners.delete(key), { once: true });
    }
    return add.call(this, type, fn, o);
  };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    if (longLived(this) && fn) listeners.delete(where(this) + "|" + type + "|" + idOf(fn) + "|" + capture(o));
    return remove.call(this, type, fn, o);
  };

  const observers = new Set();
  for (const name of ["MutationObserver", "ResizeObserver", "IntersectionObserver"]) {
    const Native = window[name];
    if (!Native) continue;
    const Wrapped = function (...args) {
      const inner = new Native(...args);
      // Targets are held weakly, so the probe never keeps an editor's element alive itself.
      const targets = new Set();
      const record = { targets };
      const observe = inner.observe;
      const unobserve = inner.unobserve;
      const disconnect = inner.disconnect;
      inner.observe = function (target, ...rest) { observers.add(record); if (![...targets].some((r) => r.deref() === target)) targets.add(new WeakRef(target)); return observe.call(inner, target, ...rest); };
      if (unobserve) inner.unobserve = function (target) { for (const r of [...targets]) if (r.deref() === target) targets.delete(r); return unobserve.call(inner, target); };
      inner.disconnect = function () { targets.clear(); return disconnect.call(inner); };
      return inner;
    };
    Wrapped.prototype = Native.prototype;
    window[name] = Wrapped;
  }

  const timers = new Set();
  const wrapTimer = (setName, clearName, repeating) => {
    const set = window[setName];
    const clear = window[clearName];
    if (!set || !clear) return;
    window[setName] = function (fn, ...rest) {
      if (typeof fn !== "function") return set.call(window, fn, ...rest);
      let id;
      const run = function (...a) { if (!repeating) timers.delete(setName + id); return fn.apply(this, a); };
      id = set.call(window, run, ...rest);
      timers.add(setName + id);
      return id;
    };
    window[clearName] = function (id) { timers.delete(setName + id); return clear.call(window, id); };
  };
  wrapTimer("setTimeout", "clearTimeout", false);
  wrapTimer("setInterval", "clearInterval", true);
  wrapTimer("requestAnimationFrame", "cancelAnimationFrame", false);
  wrapTimer("requestIdleCallback", "cancelIdleCallback", false);

  window.__probe = {
    snapshot() {
      let watching = 0;
      for (const o of [...observers]) {
        for (const r of [...o.targets]) { const t = r.deref(); if (!t || !t.isConnected) o.targets.delete(r); }
        if (o.targets.size > 0) watching++; else observers.delete(o);
      }
      return {
        listeners: listeners.size,
        observers: watching,
        timers: timers.size,
        elements: document.querySelectorAll("*").length,
        styleSheets: (document.adoptedStyleSheets || []).length + document.styleSheets.length,
      };
    },
    listenerKeys: () => [...listeners],
  };
})();`;

/** Lets pending timers and frames run out, so what is left is what was leaked. */
export const settle = (page, ms = 400) => page.waitForTimeout(ms);

export const snapshot = (page) => page.evaluate(() => window.__probe.snapshot());

/** What grew between two snapshots, as sentences (empty when nothing did). */
export function growth(before, after) {
  return Object.keys(after).filter((k) => after[k] > before[k]).map((k) => `${k} went from ${before[k]} to ${after[k]}`);
}
