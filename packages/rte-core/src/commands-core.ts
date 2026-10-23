// The commands every editor has, and the keys that run them. Each one is a thin wrapper over a pure editing operation.
import { alignAt, blockKindAt, setAlign, setBlockType } from "./blocks.ts";
import type { CommandDef } from "./commands.ts";
import { marksAt, rangeHasMark, toggleMark } from "./edit.ts";
import type { EditorSnapshot } from "./engine.ts";
import type { KeyBinding } from "./keymap.ts";
import type { UiItem, UiSlot } from "./ui.ts";
import { linkAt, setLink } from "./links.ts";
import type { Align, Mark, MarkType } from "./model.ts";
import { getContent, isCollapsed } from "./path.ts";

type Def = CommandDef<never, unknown>;
const def = <A, V>(d: CommandDef<A, V>): Def => d as unknown as Def;

/** True when the text at the selection has the mark: all of the selected text, or the text the caret would type into. */
function hasMark(snap: EditorSnapshot, type: MarkType): boolean {
  const { doc, selection } = snap;
  if (isCollapsed(selection)) return caretMarks(snap).some((m) => m.type === type);
  return rangeHasMark(doc, selection, type);
}

/** The marks text typed at the caret takes: the ones chosen for it, else those of the text around it. */
const caretMarks = (snap: EditorSnapshot): readonly Mark[] => snap.storedMarks ?? marksAt(getContent(snap.doc, snap.selection.focus.path), snap.selection.focus.offset);

function mark(name: string, label: string, type: MarkType): Def {
  return def<void, never>({
    name, label,
    // With a range selected the mark is put on (or taken off) that text; with a caret it is chosen for the text typed next.
    run: (ctx) => {
      if (!isCollapsed(ctx.snapshot.selection)) return ctx.apply("format", (doc, sel) => toggleMark(doc, sel, { type } as never));
      const now = caretMarks(ctx.snapshot);
      return ctx.setStoredMarks(now.some((m) => m.type === type) ? now.filter((m) => m.type !== type) : [...now, { type } as Mark]);
    },
    state: (snap) => ({ active: hasMark(snap, type) }),
  });
}

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

    def<0 | 1 | 2 | 3 | 4 | 5 | 6, number>({
      name: "block.heading", label: "Heading",
      // Sets exactly this level (0 is a paragraph), so choosing the level you are already in changes nothing.
      run: (ctx, level) => ctx.apply("block", (doc, sel) => {
        const now = blockKindAt(doc, sel);
        if (level === 0 ? now?.type === "p" : now?.type === "h" && now.level === level) return { doc, selection: sel };
        return setBlockType(doc, sel, level === 0 ? { type: "p" } : { type: "h", level });
      }),
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

/** Where the editor's own commands appear in a toolbar. Items name commands; they hold no markup. */
export const coreItems: readonly (readonly [UiSlot, UiItem])[] = [
  ["toolbar.main", { kind: "button", id: "undo", command: "history.undo", icon: "undo", group: "history", order: 1 }],
  ["toolbar.main", { kind: "button", id: "redo", command: "history.redo", icon: "redo", group: "history", order: 2 }],
  ["toolbar.main", {
    kind: "select", id: "block", command: "block.heading", label: "Block type", group: "block",
    options: [{ value: 0, label: "Paragraph" }, ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({ value: level, label: `Heading ${level}` }))],
  }],
  ["toolbar.main", { kind: "toggle", id: "bold", command: "format.bold", icon: "bold", group: "text", order: 1 }],
  ["toolbar.main", { kind: "toggle", id: "italic", command: "format.italic", icon: "italic", group: "text", order: 2 }],
  ["toolbar.main", { kind: "toggle", id: "underline", command: "format.underline", icon: "underline", group: "text", order: 3 }],
  ["toolbar.main", { kind: "toggle", id: "strike", command: "format.strike", icon: "strikethrough", group: "text", order: 4 }],
  ["toolbar.main", { kind: "toggle", id: "code", command: "format.code", icon: "code", group: "text", order: 5 }],
  ["toolbar.main", { kind: "toggle", id: "superscript", command: "format.superscript", icon: "superscript", group: "text", order: 6 }],
  ["toolbar.main", { kind: "toggle", id: "subscript", command: "format.subscript", icon: "subscript", group: "text", order: 7 }],
  ...(["left", "center", "right", "justify"] as const).map((align, i): readonly [UiSlot, UiItem] => ["toolbar.main", {
    kind: "toggle", id: `align-${align}`, command: "block.align", arg: align, icon: `align-${align}`, label: `Align ${align}`, group: "align", order: i,
  }]),
  ["toolbar.main", { kind: "dialog", id: "link", command: "link.set", label: "Link", icon: "link", group: "insert", order: 1, fields: [{ name: "href", type: "url", label: "Address", required: true }] }],
  ["toolbar.main", { kind: "button", id: "unlink", command: "link.remove", icon: "unlink", group: "insert", order: 2 }],
];
