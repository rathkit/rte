// The hooks this package uses, with React's contract for each, enough to render a component function by hand and count its renders.
// `render(component)` runs the component, runs effects after, and re-runs it when state or a store changes.
type Cleanup = void | (() => void);
interface Slot { value?: unknown; deps?: readonly unknown[] | undefined; cleanup?: Cleanup; unsubscribe?: () => void }
let current: { slots: Slot[]; index: number; schedule: () => void; effects: (() => void)[] } | undefined;

const slot = (): Slot => { const c = current!; return (c.slots[c.index] ??= {}, c.slots[c.index++]!); };
const same = (a: readonly unknown[] | undefined, b: readonly unknown[]) => !!a && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));

export function useState<T>(initial: T): [T, (value: T) => void] {
  const s = slot(); const c = current!;
  if (!("value" in s)) s.value = initial;
  return [s.value as T, (v) => { if (!Object.is(s.value, v)) { s.value = v; c.schedule(); } }];
}
export function useRef<T>(initial: T): { current: T } { const s = slot(); return (s.value ??= { current: initial }) as { current: T }; }
export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T {
  const s = slot(); if (!same(s.deps, deps)) { s.value = factory(); s.deps = deps; } return s.value as T;
}
export function useCallback<T>(fn: T, deps: readonly unknown[]): T { return useMemo(() => fn, deps); }
export function useEffect(effect: () => Cleanup, deps?: readonly unknown[]): void {
  const s = slot(); const c = current!;
  if (deps && same(s.deps, deps)) return;
  s.deps = deps;
  c.effects.push(() => { if (typeof s.cleanup === "function") s.cleanup(); s.cleanup = effect(); });
}
export function useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T): T {
  const s = slot(); const c = current!;
  if (s.deps?.[0] !== subscribe) {
    s.unsubscribe?.();
    s.deps = [subscribe];
    s.unsubscribe = subscribe(() => { if (!Object.is(s.value, getSnapshot())) c.schedule(); });
  }
  s.value = getSnapshot();
  return s.value as T;
}
export function createElement(type: string, props?: Record<string, unknown> | null, ...children: unknown[]) { return { type, props: props ?? {}, children }; }

export function render<R>(component: () => R) {
  const state = { slots: [] as Slot[], index: 0, effects: [] as (() => void)[], schedule: () => { pending = true; }, };
  let pending = false; let renders = 0; let output!: R;
  const pass = () => {
    do { pending = false; state.index = 0; current = state; renders++; output = component(); current = undefined;
      const run = state.effects.splice(0); for (const e of run) e(); } while (pending);
  };
  pass();
  return {
    get output() { return output; }, get renders() { return renders; },
    /** Re-render after an external change, as React would after a store wakes a component. */
    flush() { if (pending) pass(); },
    unmount() { for (const s of state.slots) { if (typeof s.cleanup === "function") s.cleanup(); s.unsubscribe?.(); } },
  };
}
