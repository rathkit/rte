// The signals this package uses, with Angular's contract: a signal notifies only when it is set to a different value, and an effect
// re-runs when a signal it read changes, running the cleanup it was given first.
type Reader = () => void;
let reading: Set<Set<Reader>> | undefined;
export interface Signal<T> { (): T }
export interface WritableSignal<T> extends Signal<T> { set(value: T): void; asReadonly(): Signal<T> }
export function signal<T>(initial: T): WritableSignal<T> {
  let value = initial; const readers = new Set<Reader>();
  const read = (() => { reading?.add(readers); return value; }) as WritableSignal<T>;
  read.set = (next) => { if (!Object.is(next, value)) { value = next; for (const r of [...readers]) r(); } };
  read.asReadonly = () => read;
  return read;
}
const roots: (() => void)[][] = [];
export function effect(fn: (onCleanup: (cleanup: () => void) => void) => void): void {
  let cleanups: (() => void)[] = []; let live = true;
  const run = (): void => {
    if (!live) return;
    cleanups.forEach((c) => c()); cleanups = [];
    const seen = new Set<Set<Reader>>(); reading = seen;
    try { fn((c) => cleanups.push(c)); } finally { reading = undefined; }
    for (const s of seen) s.add(run);
  };
  run();
  roots.at(-1)?.push(() => { live = false; cleanups.forEach((c) => c()); });
}
/** Runs `fn` as an injection context would, and returns what it made plus a way to destroy what it started. */
export function runInContext<R>(fn: () => R): { result: R; dispose(): void } {
  const fns: (() => void)[] = []; roots.push(fns);
  try { return { result: fn(), dispose: () => fns.forEach((f) => f()) }; } finally { roots.pop(); }
}
