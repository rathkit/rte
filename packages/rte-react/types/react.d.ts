// The small part of React this package uses, declared here so the repo needs no copy of React to build and test. Apps get the real types
// from @types/react; the declarations this package ships refer to `react`, not to this file.
declare module "react" {
  export type Ref<T> = ((value: T | null) => void) | { current: T | null } | null;
  export function useSyncExternalStore<T>(subscribe: (onChange: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useRef<T>(initial: T): { current: T };
  export function useState<T>(initial: T): [T, (value: T) => void];
  export function createElement(type: string, props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
}
