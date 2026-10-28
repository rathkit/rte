// The list commands and the keys that run them.
import type { CommandDef } from "../commands.ts";
import type { EditorSnapshot } from "../engine.ts";
import type { KeyBinding } from "../keymap.ts";
import { getContent, selectedContainers } from "../path.ts";
import { inlineLength } from "../model.ts";
import { inDefinitionList, setEntryKind, toggleDefinitionList } from "./definitions.ts";
import { checkedAt, insertItemParagraph, listStyleAt, setListStyle, indentItems, inChecklist, inList, outdentItems, toggleChecked, toggleChecklist, toggleList, type ListOptions } from "./lists.ts";

type Def = CommandDef<never, unknown>;
const def = <A, V>(d: CommandDef<A, V>): Def => d as unknown as Def;

const textSelected = (snap: EditorSnapshot): boolean => {
  const first = selectedContainers(snap.doc, snap.selection)[0];
  return first !== undefined && inlineLength(getContent(snap.doc, first)) >= 0;
};

/** Whether the task where the selection starts is done. */
const selectedDone = (s: EditorSnapshot): boolean => {
  const first = selectedContainers(s.doc, s.selection)[0];
  return first !== undefined && checkedAt(s.doc, first) === true;
};

const inAnyList = (s: EditorSnapshot): boolean => inList(s.doc, s.selection.focus.path) || inDefinitionList(s.doc, s.selection.focus.path);

export function listCommands(maxDepth: number): readonly Def[] {
  return [
    def<ListOptions | undefined, never>({
      name: "list.bulleted", label: "Bulleted list",
      run: (ctx, options) => ctx.apply("list", (doc, sel) => toggleList(doc, sel, "ul", options)),
      state: (s) => ({ enabled: textSelected(s), active: inList(s.doc, s.selection.focus.path, "ul") }),
    }),
    def<ListOptions | undefined, never>({
      name: "list.numbered", label: "Numbered list",
      run: (ctx, options) => ctx.apply("list", (doc, sel) => toggleList(doc, sel, "ol", options)),
      state: (s) => ({ enabled: textSelected(s), active: inList(s.doc, s.selection.focus.path, "ol") }),
    }),
    // The marker style of the list the caret is in: a style name, or "" for the default. The value is the current style, for a menu to mark.
    def<string | { readonly style?: string | null } | undefined, string>({
      name: "list.style", label: "List style",
      run: (ctx, arg) => ctx.apply("list", (doc, sel) => setListStyle(doc, sel, { style: typeof arg === "string" ? arg : arg?.style ?? null })),
      state: (s) => { const at = listStyleAt(s.doc, s.selection); return at ? { enabled: true, value: at.style ?? "" } : { enabled: false }; },
    }),
    // The number a numbered list starts at: a whole number, or empty for 1. The value is the current number, for a dialog to start from.
    def<number | string | { readonly start?: number | string | null } | undefined, string>({
      name: "list.start", label: "Start at",
      run: (ctx, arg) => ctx.apply("list", (doc, sel) => setListStyle(doc, sel, { start: typeof arg === "object" && arg !== null ? arg.start ?? null : arg ?? null })),
      state: (s) => { const at = listStyleAt(s.doc, s.selection); return at?.type === "ol" ? { enabled: true, value: at.start === undefined ? "1" : String(at.start) } : { enabled: false }; },
    }),
    def<void, never>({
      name: "list.paragraph", label: "New paragraph in item",
      run: (ctx) => ctx.apply("list", insertItemParagraph),
      state: (s) => ({ enabled: inList(s.doc, s.selection.focus.path) }),
    }),
    def<void, never>({
      name: "list.definition", label: "Definition list",
      run: (ctx) => ctx.apply("list", toggleDefinitionList),
      state: (s) => ({ enabled: textSelected(s), active: inDefinitionList(s.doc, s.selection.focus.path) }),
    }),
    def<void, never>({
      name: "list.checklist", label: "Task list",
      run: (ctx) => ctx.apply("list", toggleChecklist),
      state: (s) => ({ enabled: textSelected(s), active: inChecklist(s.doc, s.selection) }),
    }),
    // Ticks (or clears) the selected tasks; with a path, just that item, which is how a click on its checkbox reaches it.
    def<{ readonly path?: readonly number[] } | undefined, never>({
      name: "list.toggleChecked", label: "Mark done",
      run: (ctx, arg) => ctx.apply("list", (doc, sel) => toggleChecked(doc, sel, arg?.path as number[] | undefined)),
      // Always available: a click on a checkbox names its item, wherever the caret is.
      state: (s) => ({ active: selectedDone(s) }),
    }),
    def<void, never>({
      name: "list.indent", label: "Indent",
      run: (ctx) => ctx.apply("list", (doc, sel) => (inDefinitionList(doc, sel.focus.path) ? setEntryKind(doc, sel, "detail") : indentItems(doc, sel, maxDepth))),
      state: (s) => ({ enabled: inAnyList(s) }),
    }),
    def<void, never>({
      name: "list.outdent", label: "Outdent",
      run: (ctx) => ctx.apply("list", (doc, sel) => (inDefinitionList(doc, sel.focus.path) ? setEntryKind(doc, sel, "term") : outdentItems(doc, sel))),
      state: (s) => ({ enabled: inAnyList(s) }),
    }),
  ];
}

/** Mod-Enter ticks a task. */
export const taskKeys: readonly KeyBinding[] = [{ key: "Mod-Enter", command: "list.toggleChecked" }, { key: "Mod-Shift-Enter", command: "list.paragraph" }];

export const listKeys: readonly KeyBinding[] = [
  { key: "Tab", command: "list.indent", stack: true },
  { key: "Shift-Tab", command: "list.outdent", stack: true },
];
