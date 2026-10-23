// Editor state as Vue refs. Each ref is fed by one of the headless stores, so it changes only when the value it holds does.
import { onScopeDispose, shallowRef, unref, watch, type MaybeRef, type Ref } from "vue";
import { commandStore, selectStore, type ExternalStore, type HeadlessEditor } from "@rathkit/rte-headless";
import type { CommandState, EditorSnapshot } from "@rathkit/rte-core";

const idle: CommandState = Object.freeze({ enabled: false, active: false, value: undefined }) as CommandState;

/** Follows a store with a ref. The editor may be given as a ref that fills in later; the ref follows whichever editor is current. */
export function useStore<T, E extends HeadlessEditor | undefined>(editor: MaybeRef<E>, make: (editor: HeadlessEditor) => ExternalStore<T>, empty: T): Readonly<Ref<T>> {
  const state = shallowRef<T>(empty);
  let unsubscribe = (): void => undefined;
  const stop = watch(() => unref(editor), (current) => {
    unsubscribe();
    if (!current) { state.value = empty; return; }
    const store = make(current);
    state.value = store.getSnapshot();
    unsubscribe = store.subscribe(() => { state.value = store.getSnapshot(); });
  }, { immediate: true });
  onScopeDispose(() => { stop(); unsubscribe(); });
  return state;
}

/** One command's state: whether it can run, whether it is on, its value. Off and disabled until the editor exists. */
export function useCommand(editor: MaybeRef<HeadlessEditor | undefined>, name: string): Readonly<Ref<CommandState>> {
  return useStore(editor, (e) => commandStore(e, name), idle);
}

/** One value worked out from the editor state. The ref changes, and anything reading it re-runs, only when that value changes. */
export function useSelector<T>(editor: MaybeRef<HeadlessEditor | undefined>, selector: (snapshot: EditorSnapshot) => T, equals?: (a: T, b: T) => boolean): Readonly<Ref<T | undefined>> {
  return useStore<T | undefined, HeadlessEditor | undefined>(editor, (e) => selectStore(e, selector, equals as never), undefined);
}
