// The commands every editor has, and the keys that run them. Each one is a thin wrapper over a pure editing operation.
import { alignAt, blockKindAt, setAlign, setBlockType } from "./blocks.ts";
import type { CommandDef } from "./commands.ts";
import { inDefinitionList, setEntryKind, toggleDefinitionList } from "./definitions.ts";
import { marksAt, rangeHasMark, toggleMark } from "./edit.ts";
import type { EditorSnapshot } from "./engine.ts";
import type { KeyBinding } from "./keymap.ts";
import { indentItems, inList, outdentItems, toggleList, type ListOptions } from "./lists.ts";
import { linkAt, setLink } from "./links.ts";
import { inlineLength, type Align, type MarkType } from "./model.ts";
import { getContent, isCollapsed, selectedContainers } from "./path.ts";

type Def = CommandDef<never, unknown>;
const def = <A, V>(d: CommandDef<A, V>): Def => d as unknown as Def;

/** True when the text at the selection has the mark: all of the selected text, or the text the caret would type into. */
function hasMark(snap: EditorSnapshot, type: MarkType): boolean {
  const { doc, selection } = snap;
  if (isCollapsed(selection)) return marksAt(getContent(doc, selection.focus.path), selection.focus.offset).some((m) => m.type === type);
  return rangeHasMark(doc, selection, type);
}

function mark(name: string, label: string, type: MarkType): Def {
  return def<void, never>({
    name, label,
    // With nothing selected there is no text to change. (Typing with a mark switched on is not built yet.)
    run: (ctx) => ctx.apply("format", (doc, sel) => toggleMark(doc, sel, { type } as never)),
    state: (snap) => ({ enabled: !isCollapsed(snap.selection), active: hasMark(snap, type) }),
  });
}

const textSelected = (snap: EditorSnapshot): boolean => {
  const first = selectedContainers(snap.doc, snap.selection)[0];
  return first !== undefined && inlineLength(getContent(snap.doc, first)) >= 0;
};

export function coreCommands(): readonly Def[] {
  return [
    def<void, never>({ name: "history.undo", label: "Undo", mutates: false, run: (ctx) => ctx.undo(), state: (s) => ({ enabled: s.canUndo }) }),
    def<void, never>({ name: "history.redo", label: "Redo", mutates: false, run: (ctx) => ctx.redo(), state: (s) => ({ enabled: s.canRedo }) }),

    mark("format.bold", "Bold", "bold"),
    mark("format.italic", "Italic", "italic"),
    mark("format.underline", "Underline", "underline"),
    mark("format.strike", "Strikethrough", "strike"),
    mark("format.code", "Code", "code"),
    mark("format.superscript", "Superscript", "sup"),
    mark("format.subscript", "Subscript", "sub"),

    def<1 | 2 | 3 | 4 | 5 | 6, number>({
      name: "block.heading", label: "Heading",
      run: (ctx, level) => ctx.apply("block", (doc, sel) => setBlockType(doc, sel, { type: "h", level })),
      state: (s) => {
        const kind = blockKindAt(s.doc, s.selection);
        return { enabled: kind?.type === "p" || kind?.type === "h" || kind?.type === "pre", active: kind?.type === "h", value: kind?.type === "h" ? (kind.level as number) : 0 };
      },
    }),
    def<void, never>({
      name: "block.paragraph", label: "Paragraph",
      run: (ctx) => ctx.apply("block", (doc, sel) => setBlockType(doc, sel, { type: "p" })),
      state: (s) => {
        const kind = blockKindAt(s.doc, s.selection);
        return { enabled: kind?.type === "p" || kind?.type === "h" || kind?.type === "pre", active: kind?.type === "p" };
      },
    }),
    def<Align, Align>({
      name: "block.align", label: "Align",
      run: (ctx, align) => ctx.apply("block", (doc, sel) => setAlign(doc, sel, align)),
      state: (s) => {
        const kind = blockKindAt(s.doc, s.selection);
        return { enabled: kind?.type === "p" || kind?.type === "h", value: alignAt(s.doc, s.selection) ?? "left" };
      },
    }),

    def<{ readonly href: string }, string>({
      name: "link.set", label: "Link",
      run: (ctx, arg) => ctx.apply("link", (doc, sel) => setLink(doc, sel, arg?.href)),
      state: (s) => ({ enabled: !isCollapsed(s.selection) || linkAt(s.doc, s.selection) !== undefined, active: linkAt(s.doc, s.selection) !== undefined, ...(linkAt(s.doc, s.selection) !== undefined ? { value: linkAt(s.doc, s.selection) as string } : {}) }),
    }),
    def<void, never>({
      name: "link.remove", label: "Remove link",
      run: (ctx) => ctx.apply("link", (doc, sel) => setLink(doc, sel, undefined)),
      state: (s) => ({ enabled: linkAt(s.doc, s.selection) !== undefined }),
    }),

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
    def<void, never>({
      name: "list.definition", label: "Definition list",
      run: (ctx) => ctx.apply("list", toggleDefinitionList),
      state: (s) => ({ enabled: textSelected(s), active: inDefinitionList(s.doc, s.selection.focus.path) }),
    }),
  ];
}

// Indent and outdent need the engine's list depth setting, so they are built with it.
export function listMoveCommands(maxDepth: () => number): readonly Def[] {
  const applicable = (s: EditorSnapshot): boolean => inList(s.doc, s.selection.focus.path) || inDefinitionList(s.doc, s.selection.focus.path);
  return [
    def<void, never>({
      name: "list.indent", label: "Indent",
      run: (ctx) => ctx.apply("list", (doc, sel) => (inDefinitionList(doc, sel.focus.path) ? setEntryKind(doc, sel, "detail") : indentItems(doc, sel, maxDepth()))),
      state: (s) => ({ enabled: applicable(s) }),
    }),
    def<void, never>({
      name: "list.outdent", label: "Outdent",
      run: (ctx) => ctx.apply("list", (doc, sel) => (inDefinitionList(doc, sel.focus.path) ? setEntryKind(doc, sel, "term") : outdentItems(doc, sel))),
      state: (s) => ({ enabled: applicable(s) }),
    }),
  ];
}

export const coreKeys: readonly KeyBinding[] = [
  { key: "Mod-b", command: "format.bold" },
  { key: "Mod-i", command: "format.italic" },
  { key: "Mod-u", command: "format.underline" },
  { key: "Mod-z", command: "history.undo" },
  { key: "Mod-Shift-z", command: "history.redo" },
  { key: "Ctrl-y", command: "history.redo" },
];

export const listKeys: readonly KeyBinding[] = [
  { key: "Tab", command: "list.indent" },
  { key: "Shift-Tab", command: "list.outdent" },
];
