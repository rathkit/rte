// The platform features the editor cannot work without (docs/SUPPORT.md, "Support window"). Each is called by the editor with no fallback;
// a browser in the support window has all of them. Nothing here runs when the module is imported, so it is safe in Node with no DOM.

/** The scope the features are looked up in: the page's window, or anything shaped like it (a test passes a stand-in). */
type Scope = Record<string, unknown>;

const proto = (scope: Scope, name: string): Record<string, unknown> | undefined => {
  const ctor = scope[name];
  return typeof ctor === "function" ? (ctor as { prototype?: Record<string, unknown> }).prototype : undefined;
};
const hasMethod = (scope: Scope, name: string, method: string): boolean => typeof proto(scope, name)?.[method] === "function";

const FEATURES: readonly (readonly [string, (scope: Scope) => boolean])[] = [
  ["window.getSelection", (s) => typeof s.getSelection === "function"],
  ["InputEvent.prototype.getTargetRanges (beforeinput)", (s) => hasMethod(s, "InputEvent", "getTargetRanges")],
  ["MutationObserver", (s) => typeof s.MutationObserver === "function"],
  ["Element.prototype.replaceChildren", (s) => hasMethod(s, "Element", "replaceChildren")],
  ["queueMicrotask", (s) => typeof s.queueMicrotask === "function"],
  ["Array.prototype.at", (s) => hasMethod(s, "Array", "at")],
  ["Object.hasOwn", (s) => typeof (s.Object as { hasOwn?: unknown } | undefined)?.hasOwn === "function"],
];

/**
 * The platform features the editor needs that this browser does not have, by name; empty when it has them all. Call it before making an
 * editor to choose something else (a plain `<textarea>`, a message) in a browser below the support window. The editor makes this check
 * itself and reports `unsupported-browser` to `onWarning` when something is missing, but it still starts, and nothing is promised about how
 * it then behaves. In Node, with no DOM, it lists the browser features. See docs/SUPPORT.md, "Support window".
 */
export function missingFeatures(scope: Scope = globalThis as unknown as Scope): string[] {
  return FEATURES.filter(([, has]) => !has(scope)).map(([name]) => name);
}
