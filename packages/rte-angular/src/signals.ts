// Editor state as Angular signals. Each is fed by one of the headless stores, so it changes only when the value it holds does.
// Call them where Angular allows an effect to be made: a constructor, a field initializer or `runInInjectionContext`.
import { effect, signal, type Signal } from "@angular/core";
import { commandStore, selectStore, type ExternalStore, type HeadlessEditor } from "@rathkit/rte-headless";
import type { CommandState, EditorSnapshot } from "@rathkit/rte-core";

const idle: CommandState = Object.freeze({ enabled: false, active: false, value: undefined }) as CommandState;

/** Follows a store with a signal. The editor is a signal that fills in later; the result follows whichever editor is current. */
export function storeSignal<T>(editor: Signal<HeadlessEditor | undefined>, make: (editor: HeadlessEditor) => ExternalStore<T>, empty: T): Signal<T> {
  const state = signal<T>(empty);
  effect((onCleanup) => {
    const current = editor();
    if (!current) { state.set(empty); return; }
    const store = make(current);
    state.set(store.getSnapshot());
    onCleanup(store.subscribe(() => state.set(store.getSnapshot())));
  });
  return state.asReadonly();
}

/** One command's state: whether it can run, whether it is on, its value. Off and disabled until the editor exists. */
export function commandState(editor: Signal<HeadlessEditor | undefined>, name: string): Signal<CommandState> {
  return storeSignal(editor, (e) => commandStore(e, name), idle);
}

/** One value worked out from the editor state. The signal changes, and anything reading it re-runs, only when that value changes. */
export function selected<T>(editor: Signal<HeadlessEditor | undefined>, selector: (snapshot: EditorSnapshot) => T, equals?: (a: T, b: T) => boolean): Signal<T | undefined> {
  return storeSignal<T | undefined>(editor, (e) => selectStore(e, selector, equals as never), undefined);
}
