// Editor state as React state. Each hook is `useSyncExternalStore` over one of the headless stores, so a component re-renders when the
// value it asked for changes and not when anything else in the editor does.
import { useMemo, useSyncExternalStore } from "react";
import { commandStore, selectStore, type ExternalStore, type HeadlessEditor } from "@rathkit/rte-headless";
import type { CommandState, EditorSnapshot } from "@rathkit/rte-core";

const idle: CommandState = Object.freeze({ enabled: false, active: false, value: undefined }) as CommandState;
const nothing: ExternalStore<never> = { subscribe: () => () => undefined, getSnapshot: () => undefined as never };

/** Reads an external store (any of `commandStore`, `selectStore`, `snapshotStore`) as React state. */
export function useStore<T>(store: ExternalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** One command's state: whether it can run, whether it is on, its value. Before the editor exists it is off and disabled. */
export function useCommand(editor: HeadlessEditor | undefined, name: string): CommandState {
  const store = useMemo<ExternalStore<CommandState>>(() => (editor ? commandStore(editor, name) : { subscribe: nothing.subscribe, getSnapshot: () => idle }), [editor, name]);
  return useStore(store);
}

/**
 * One value worked out from the editor state, such as a word count. The component re-renders only when that value changes. Give a
 * stable `selector` (declare it outside the component or wrap it in `useCallback`), or the store is rebuilt on every render.
 */
export function useSelector<T>(editor: HeadlessEditor | undefined, selector: (snapshot: EditorSnapshot) => T, equals?: (a: T, b: T) => boolean): T | undefined {
  const store = useMemo<ExternalStore<T | undefined>>(() => (editor ? selectStore(editor, selector, equals as never) : { subscribe: nothing.subscribe, getSnapshot: () => undefined }), [editor, selector, equals]);
  return useStore(store);
}
