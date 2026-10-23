// Editor state as Svelte stores. Svelte's store contract is a plain shape (`subscribe(run)` returning how to stop), so this package
// needs nothing from Svelte to meet it: use the stores with `$store` in a component.
import { commandStore, selectStore, toReadable, type HeadlessEditor, type Readable } from "@rathkit/rte-headless";
import type { CommandState, EditorSnapshot } from "@rathkit/rte-core";

/** One command's state: whether it can run, whether it is on, its value. */
export function command(editor: HeadlessEditor, name: string): Readable<CommandState> {
  return toReadable(commandStore(editor, name));
}

/** One value worked out from the editor state. Subscribers hear about it only when that value changes. */
export function selector<T>(editor: HeadlessEditor, select: (snapshot: EditorSnapshot) => T, equals?: (a: T, b: T) => boolean): Readable<T> {
  return toReadable(selectStore(editor, select, equals));
}
