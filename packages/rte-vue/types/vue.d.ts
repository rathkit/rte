// The small part of Vue this package uses, declared so the repo needs no copy of Vue. Apps get the real types from Vue itself.
declare module "vue" {
  export interface Ref<T> { value: T }
  export type MaybeRef<T> = T | Ref<T>;
  export function shallowRef<T>(value: T): Ref<T>;
  export function unref<T>(value: MaybeRef<T>): T;
  export function watch<T>(source: () => T, callback: (value: T) => void, options?: { immediate?: boolean }): () => void;
  export function onScopeDispose(fn: () => void): void;
  export function onMounted(fn: () => void): void;
  export function onBeforeUnmount(fn: () => void): void;
  export function h(type: string, props?: Record<string, unknown> | null): unknown;
  export function defineComponent(options: Record<string, unknown>): unknown;
}
