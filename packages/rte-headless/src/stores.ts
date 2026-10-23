// The editor's state as external stores: the one shape every framework's reactivity can be built on. A store has `subscribe(onChange)`,
// which calls back (with nothing) when the value may have changed and returns a way to stop, and `getSnapshot()`, which returns the current
// value and returns the very same value until it really changes. That is exactly what React's `useSyncExternalStore` asks for; Vue wraps
// it in a `shallowRef`; Svelte's store contract is one small function away (`toReadable`). A wrapper never reimplements any of this.
import type { CommandState, EditorSnapshot } from "@rathkit/rte-core";
import type { HeadlessEditor, Unsubscribe } from "./types.ts";

export interface ExternalStore<T> {
  subscribe(onChange: () => void): Unsubscribe;
  getSnapshot(): T;
}

/** A command's state: enabled, active, value. The same object until it changes. */
export function commandStore(editor: HeadlessEditor, command: string): ExternalStore<CommandState> {
  return {
    subscribe: (onChange) => editor.commands.subscribe(command, onChange),
    getSnapshot: () => editor.commands.state(command),
  };
}

/** The whole editor state. A new object after every change to the document, selection, focus or read-only state. */
export function snapshotStore(editor: HeadlessEditor): ExternalStore<EditorSnapshot> {
  return {
    subscribe: (onChange) => editor.subscribe(() => onChange()),
    getSnapshot: () => editor.snapshot,
  };
}

/**
 * One value worked out from the state, such as the document's word count. Only changes in that value wake the subscriber. The snapshot is
 * remembered per editor state, so asking twice between changes costs nothing and returns the same value.
 */
export function selectStore<T>(editor: HeadlessEditor, selector: (snapshot: EditorSnapshot) => T, equals: (a: T, b: T) => boolean = Object.is): ExternalStore<T> {
  let version = -1;
  let value: T;
  return {
    subscribe: (onChange) => editor.select(selector, () => onChange(), equals),
    getSnapshot() {
      const snap = editor.snapshot;
      if (snap.version === version) return value;
      const next = selector(snap);
      if (version === -1 || !equals(value, next)) value = next;
      version = snap.version;
      return value;
    },
  };
}

/** The Svelte store contract: `subscribe(run)` calls `run` at once with the value, again on each change, and returns how to stop. */
export interface Readable<T> {
  subscribe(run: (value: T) => void): Unsubscribe;
}

export function toReadable<T>(store: ExternalStore<T>): Readable<T> {
  return {
    subscribe(run) {
      run(store.getSnapshot());
      let last = store.getSnapshot();
      return store.subscribe(() => {
        const next = store.getSnapshot();
        if (!Object.is(next, last)) {
          last = next;
          run(next);
        }
      });
    },
  };
}
