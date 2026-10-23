// The reactivity this package uses, with Vue's contract: a ref notifies watchers only when its value is replaced by a different one.
export interface Ref<T> { value: T }
type Watcher = () => void;
const scopes: (() => void)[][] = [];
export function shallowRef<T>(initial: T): Ref<T> {
  let value = initial; const watchers = new Set<Watcher>();
  return {
    get value() { tracking?.add(watchers); return value; },
    set value(next: T) { if (!Object.is(next, value)) { value = next; for (const w of [...watchers]) w(); } },
  };
}
let tracking: Set<Set<Watcher>> | undefined;
export const unref = <T>(v: T | Ref<T>): T => (v && typeof v === "object" && "value" in (v as object) ? (v as Ref<T>).value : (v as T));
export function watch<T>(source: () => T, callback: (value: T) => void, options?: { immediate?: boolean }): () => void {
  let last: T; let live = true; let first = true;
  const run = () => {
    if (!live) return;
    const seen = new Set<Set<Watcher>>(); tracking = seen; const next = source(); tracking = undefined;
    for (const w of seen) w.add(run);
    if (first ? options?.immediate : !Object.is(next, last)) callback(next);
    first = false; last = next;
  };
  run();
  return () => { live = false; };
}
export function onScopeDispose(fn: () => void): void { scopes.at(-1)?.push(fn); }
export const onMounted = () => undefined;
export const onBeforeUnmount = () => undefined;
export const h = () => undefined;
export const defineComponent = (o: unknown) => o;
/** Runs `fn` as a component's setup would, and returns what it made plus a way to dispose the scope. */
export function runInScope<R>(fn: () => R): { result: R; dispose(): void } {
  const fns: (() => void)[] = []; scopes.push(fns);
  try { return { result: fn(), dispose: () => fns.forEach((f) => f()) }; } finally { scopes.pop(); }
}
