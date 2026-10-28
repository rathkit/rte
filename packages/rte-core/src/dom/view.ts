// The editing surface. The document model is the source of truth: the view intercepts the browser's
// input events, applies each one to the model, then draws the model back. The browser never edits the
// document itself, so Chromium, Firefox and WebKit all end up with the same result.
import { createEngine } from "../core.ts";
import {
  caret, clampPos, deleteBackward, deleteForward, deleteSelection, deleteToEdge, deleteWord, extractSelection, insertBlocks, insertLineBreak,
  insertText, isCollapsed, moveSelection, selectedText, splitBlock, transposeChars, type EditResult,
} from "../edit.ts";
import type { Engine } from "../engine.ts";
import type { Plugin } from "../plugin.ts";
import { exportHtml } from "../export.ts";
import { importBlocks, importHtml } from "../import.ts";
import { inlineLength, type Block, type Doc, type MarkType } from "../model.ts";
import { pasteBlocks, type ClipboardData, type PasteHandler } from "../paste.ts";
import { cellChain, getContent, setContent, type Pos, type Selection } from "../path.ts";
import { tableFromText } from "../tablefill.ts";
import { imageSelection } from "../imageselect.ts";
import { ImageSelection } from "./imageview.ts";
import { TableGrips } from "./tablegrips.ts";
import { CellMarks, installColumnResize } from "./tableview.ts";
import { containerAt, createRenderCache, domFromPos, posFromDom, renderDoc } from "./render.ts";

/** Input types the browser may ask for that are commands here: the command, and what it is given ("data" is the event's text). */
const INPUT_COMMANDS: Readonly<Record<string, readonly [string, unknown?]>> = {
  formatSubscript: ["format.subscript"], formatSuperscript: ["format.superscript"],
  formatJustifyLeft: ["block.align", "left"], formatJustifyCenter: ["block.align", "center"], formatJustifyRight: ["block.align", "right"], formatJustifyFull: ["block.align", "justify"],
  insertHorizontalRule: ["block.rule"], formatRemove: ["format.clear"],
  formatFontColor: ["format.color", "data"], formatBackColor: ["format.background", "data"],
  formatIndent: ["block.indent"], formatOutdent: ["block.outdent"],
  insertLink: ["link.set", "href"], insertOrderedList: ["list.numbered"], insertUnorderedList: ["list.bulleted"],
  formatSetBlockTextDirection: ["block.direction", "data"],
};

export interface EditorOptions {
  readonly element: HTMLElement;
  readonly html?: string;
  readonly pasteHandlers?: readonly PasteHandler[];
  readonly readOnly?: boolean;
  /** Draw remote (`http`, `https`) images. Off by default, so pasting never makes the browser fetch anything. */
  readonly loadRemoteImages?: boolean;
  /** Called with the `inputType` of input the editor does not handle. That input is blocked, not applied. */
  readonly onUnhandledInput?: (inputType: string) => void;
  /** Plugins to add: lists, for one (`@rathkit/rte-core/lists`). With none, the editor has only what is built in. */
  readonly plugins?: readonly Plugin[];
  /**
   * A hint shown while the document is empty. The editor marks itself `data-rk-empty` when empty, says the hint to assistive
   * technology (`aria-placeholder`) and puts it in the custom property `--rk-placeholder`; the styled interface draws it.
   */
  readonly placeholder?: string;
  /** The most text the document may hold, in characters. Typing and pasting past it are refused (see `onMaxLength`). */
  readonly maxLength?: number;
  /** Called when an edit is refused for being past `maxLength`, with the limit and what the length would have been. */
  readonly onMaxLength?: (info: { readonly limit: number; readonly wouldBe: number }) => void;
  /** Whether the browser checks spelling here. Default: the browser's own setting for the page. */
  readonly spellcheck?: boolean;
  /** Put the caret in the editor when it is made. */
  readonly autofocus?: boolean;
}

type Listener = (editor: Editor) => void;

export class Editor {
  readonly element: HTMLElement;
  /** The editor's state, commands, keys and plugins. It has no DOM, so everything it does can be driven without a page. */
  readonly engine: Engine;
  private composing = false;
  private reading = false;
  private readonly loadRemoteImages: boolean;
  private readonly unhandled: ((inputType: string) => void) | undefined;
  private dragSource: Selection | null = null;
  private readonly renderCache = createRenderCache();
  /** Notices changes to the page that the editor did not make, so the block they touched is drawn again from the model. */
  private readonly observer = new MutationObserver((records) => {
    for (const record of records) {
      let node: Node | null = record.target;
      // Inside a table the cells around the change are marked too, so only they are drawn again, not the whole table.
      for (let up: Node | null = node; up && up !== this.element; up = up.parentNode) {
        if (up instanceof HTMLElement && (up.tagName === "TD" || up.tagName === "TH")) this.renderCache.dirty.add(up);
      }
      while (node && node.parentNode !== this.element) node = node.parentNode;
      if (node) this.renderCache.dirty.add(node);
    }
  });
  private readonly cleanups: (() => void)[] = [];
  private readonly cellMarks: CellMarks;
  private readonly imageSelection: ImageSelection;
  private readonly tableGrips: TableGrips;

  constructor(options: EditorOptions) {
    this.element = options.element;
    this.loadRemoteImages = options.loadRemoteImages ?? false;
    this.unhandled = options.onUnhandledInput;
    this.engine = createEngine({
      readOnly: options.readOnly ?? false,
      // Before the engine reads the selection, bring it up to date from the page; asked to focus, focus the page.
      beforeAccess: () => this.readSelection(),
      focus: () => this.element.focus(),
      ...(options.maxLength !== undefined ? { maxLength: options.maxLength } : {}),
      ...(options.onMaxLength ? { onMaxLength: options.onMaxLength } : {}),
    });
    this.cellMarks = new CellMarks(this.element, this.engine, () => this.observer.takeRecords());
    this.imageSelection = new ImageSelection(this.element, this.engine, () => this.observer.takeRecords());
    this.cleanups.push(() => this.imageSelection.destroy());
    this.tableGrips = new TableGrips(this.element, this.engine);
    this.cleanups.push(() => this.tableGrips.destroy());
    this.engine.pasteHandlers.push(...(options.pasteHandlers ?? []));
    for (const plugin of options.plugins ?? []) this.engine.use(plugin);
    // The document is read once the plugins are in, so what they teach the importer applies to it.
    this.engine.setDocument(importHtml(options.html ?? "", this.engine.importOptions));
    this.element.setAttribute("contenteditable", this.engine.readOnly ? "false" : "true");
    this.element.setAttribute("role", "textbox");
    this.element.setAttribute("aria-multiline", "true");
    this.element.style.whiteSpace = "pre-wrap";
    if (options.spellcheck !== undefined) this.element.spellcheck = options.spellcheck;
    this.setPlaceholder(options.placeholder ?? "");
    this.draw();
    // The page follows the model: after every change to the document it is drawn again, and a selection the editor set (not one
    // the page reported) is written to the page.
    let wasFocused = this.engine.snapshot.focused;
    this.cleanups.push(this.engine.onTransaction((snapshot, _previous, change) => {
      if (change.docChanged) this.draw();
      else if (change.selectionChanged && !this.reading) this.writeSelection();
      const focusMoved = snapshot.focused !== wasFocused;
      wasFocused = snapshot.focused;
      if (change.docChanged || change.selectionChanged) {
        this.cellMarks.update();
        this.imageSelection.update();
      }
      // The table handles belong to the editor having the focus, so they follow it as well as the caret.
      if (change.docChanged || change.selectionChanged || focusMoved) this.tableGrips.update();
    }));
    installColumnResize(this.element, this.engine, (target, type, handler) => this.listen(target, type, handler), () => this.observer.takeRecords());
    this.listen(this.element, "focusin", () => this.engine.setFocused(true));
    this.listen(this.element, "focusout", () => this.engine.setFocused(false));
    this.listen(this.element, "beforeinput", (e) => this.onBeforeInput(e as InputEvent));
    this.listen(this.element, "paste", (e) => this.onPaste(e as ClipboardEvent));
    // A click on a task's checkbox ticks it without moving the caret. (The checkbox is not text; the command is the lists plugin's.)
    this.listen(this.element, "mousedown", (e) => {
      const box = (e.target as Element | null)?.closest?.("[data-rte-check]");
      if (!box || !this.element.contains(box)) return;
      e.preventDefault();
      const item = box.closest("li");
      const path = item && posFromDom(this.element, item, 0)?.path;
      if (path) this.engine.commands.run("list.toggleChecked", { path });
    });
    this.listen(this.element, "keydown", (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(this.element, "copy", (e) => this.onCopy(e as ClipboardEvent, false));
    this.listen(this.element, "cut", (e) => this.onCopy(e as ClipboardEvent, true));
    this.listen(this.element, "dragstart", (e) => this.onDragStart(e as DragEvent));
    this.listen(this.element, "dragend", () => { this.dragSource = null; });
    this.listen(this.element, "dragover", (e) => this.onDragOver(e as DragEvent));
    this.listen(this.element, "drop", (e) => this.onDrop(e as DragEvent));
    this.listen(this.element, "compositionstart", () => { this.composing = true; });
    this.listen(this.element, "compositionend", () => { this.composing = false; this.reconcileFromDom(); });
    this.listen(document, "selectionchange", () => this.readSelection());
    this.observer.observe(this.element, { subtree: true, childList: true, characterData: true, attributes: true });
    if (options.autofocus) this.focus();
  }

  // ---- state ----------------------------------------------------------------------------------------------

  get doc(): Doc { return this.engine.document; }
  get selection(): Selection { return this.engine.selection; }
  /** Words and characters in the document and in the selection. */
  counts(): ReturnType<Engine["counts"]> { return this.engine.counts(); }
  /** The part of the page between two positions in the document, for drawing over it (a highlight) or scrolling to it. Null if it is not drawn. */
  rangeFor(from: Pos, to: Pos): Range | null {
    const a = domFromPos(this.element, from);
    const b = domFromPos(this.element, to);
    if (!a || !b) return null;
    const range = document.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    return range;
  }
  get canUndo(): boolean { return this.engine.canUndo; }
  get canRedo(): boolean { return this.engine.canRedo; }
  get readOnly(): boolean { return this.engine.readOnly; }

  /** Named commands and their state: `editor.commands.run("format.bold")`, `editor.commands.state("format.bold")`. */
  get commands(): Engine["commands"] { return this.engine.commands; }
  /** Interface items (toolbar buttons and the like) that the editor and its plugins offer. */
  get ui(): Engine["ui"] { return this.engine.ui; }
  /** Key chords and the commands they run. */
  get keymap(): Engine["keymap"] { return this.engine.keymap; }
  /** The current immutable state. */
  get snapshot(): Engine["snapshot"] { return this.engine.snapshot; }
  subscribe: Engine["subscribe"] = (listener) => this.engine.subscribe(listener);
  select: Engine["select"] = (selector, onChange, equals) => this.engine.select(selector, onChange, equals);
  /** Adds a plugin. Returns a function that removes it. */
  use: Engine["use"] = (plugin) => this.engine.use(plugin);

  /** The document as HTML. `separator` goes between blocks (a newline makes it readable). */
  getHtml(separator = ""): string { return exportHtml(this.engine.document, separator); }

  /** Addresses of remote images in the document, so the host can decide whether to show them. */
  remoteImages(): string[] {
    const found: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        const node = value as { type?: string; src?: string };
        if (node.type === "image" && typeof node.src === "string" && /^https?:/i.test(node.src)) found.push(node.src);
        Object.values(value).forEach(visit);
      }
    };
    visit(this.engine.document.blocks);
    return found;
  }

  /** Sets the hint shown while the document is empty ("" for none). */
  setPlaceholder(text: string): void {
    if (text === "") {
      this.element.removeAttribute("aria-placeholder");
      this.element.style.removeProperty("--rk-placeholder");
    } else {
      this.element.setAttribute("aria-placeholder", text);
      // A CSS string: quoted, with quotes and backslashes escaped, and a line break as a line break.
      this.element.style.setProperty("--rk-placeholder", `"${text.replace(/[\\"]/g, "\\$&").replace(/\n/g, "\\A ")}"`);
    }
  }

  /** Replaces the whole document and empties the history. */
  setHtml(html: string): void {
    this.engine.setDocument(importHtml(html, this.engine.importOptions));
  }

  setReadOnly(value: boolean): void {
    this.engine.setReadOnly(value);
    this.element.setAttribute("contenteditable", value ? "false" : "true");
  }

  /** Calls back after the document or selection changed, once per turn. Same as `subscribe`, kept for older callers. */
  onChange(listener: Listener): () => void {
    return this.engine.subscribe(() => listener(this));
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.observer.disconnect();
    // The page is left as plain content, not as an editing surface that no longer has an editor behind it.
    for (const name of ["contenteditable", "role", "aria-multiline"]) this.element.removeAttribute(name);
    this.element.style.whiteSpace = "";
  }

  /** Puts the keyboard focus in the editor and the caret or selection back where the editor has it. */
  focus(): void {
    this.element.focus();
    this.writeSelection();
  }

  /** Sets the selection from two DOM points (used by hosts and tests). */
  selectDom(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number): void {
    const domSel = document.getSelection();
    domSel?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
    this.readSelection(true);
  }

  selectAll(): void {
    const paths = this.element.querySelectorAll("[data-rte]");
    const first = paths[0];
    const last = paths[paths.length - 1];
    if (!first || !last) return;
    const a = posFromDom(this.element, first, 0);
    const lastKids = last.childNodes.length;
    const f = posFromDom(this.element, last, lastKids);
    if (a && f) this.setSelection({ anchor: a, focus: f });
  }

  // ---- commands -------------------------------------------------------------------------------------------

  toggle(mark: MarkType): void {
    const names = { bold: "format.bold", italic: "format.italic", underline: "format.underline", strike: "format.strike", code: "format.code", sup: "format.superscript", sub: "format.subscript" } as const;
    if (mark in names) this.engine.commands.run(names[mark as keyof typeof names]);
  }

  undo(): void { this.engine.undo(); }
  redo(): void { this.engine.redo(); }

  /** Pastes raw clipboard data through the same pipeline a paste event uses. */
  paste(data: ClipboardData): void {
    let blocks = pasteBlocks(data, this.engine.pasteHandlers, this.engine.importOptions);
    if (blocks.length === 0) return;
    // Plain text with tabs, pasted into a table, is cells.
    if (!data.html?.trim() && data.text) {
      this.engine.refresh();
      const table = cellChain(this.engine.document, this.engine.selection.focus.path).length > 0 ? tableFromText(data.text) : undefined;
      if (table) blocks = [table];
    }
    this.insertSettled(blocks);
  }

  /**
   * Inserts blocks after the plugins that change pasted blocks have had their say (the image policy, say). If none of them
   * takes time, this is synchronous; if one does (an upload), the paste waits for it.
   */
  private insertSettled(blocks: readonly Block[]): void {
    let result: readonly Block[] | Promise<readonly Block[]> = blocks;
    for (const transform of this.engine.pasteTransforms) result = result instanceof Promise ? result.then(transform) : transform(result);
    if (result instanceof Promise) {
      this.engine.refresh();
      const at = this.engine.selection;
      void result.then((settled) => {
        this.apply("paste", (doc) => insertBlocks(doc, { anchor: clampPos(doc, at.anchor), focus: clampPos(doc, at.focus) }, settled, this.engine.behaviors));
      });
    } else {
      const settled = result;
      this.apply("paste", (doc, sel) => insertBlocks(doc, sel, settled, this.engine.behaviors));
    }
  }

  // ---- plumbing -------------------------------------------------------------------------------------------

  private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  private draw(): void {
    renderDoc(this.engine.document, this.element, { loadRemoteImages: this.loadRemoteImages }, this.renderCache);
    const blocks = this.engine.document.blocks;
    this.element.toggleAttribute("data-rk-empty", blocks.length === 1 && blocks[0]?.type === "p" && blocks[0].content.length === 0);
    // Changes drawing just made are not disturbances; throw their records away.
    this.observer.takeRecords();
    this.writeSelection();
  }

  private setSelection(sel: Selection): void {
    this.engine.setSelection({ anchor: clampPos(this.engine.document, sel.anchor), focus: clampPos(this.engine.document, sel.focus) });
  }

  /**
   * Brings the editor's selection up to date from the page. Only while the editor has the focus: when focus is somewhere else (a dialog,
   * a toolbar button) the page's selection is not the editor's business, and the editor keeps the selection it had.
   */
  private readSelection(force = false): void {
    if (!force && !this.element.contains(document.activeElement)) return;
    const domSel = document.getSelection();
    if (!domSel || domSel.rangeCount === 0 || !domSel.anchorNode || !domSel.focusNode) return;
    if (!this.element.contains(domSel.anchorNode) || !this.element.contains(domSel.focusNode)) return;
    // A drag from cell to cell makes Firefox select one range per cell: the selection runs from the start of the first to the end of the last.
    const first = domSel.rangeCount > 1 ? domSel.getRangeAt(0) : undefined;
    const last = first ? domSel.getRangeAt(domSel.rangeCount - 1) : undefined;
    const anchor = first ? this.posOf(first.startContainer, first.startOffset) : this.posOf(domSel.anchorNode, domSel.anchorOffset);
    const focus = last ? this.posOf(last.endContainer, last.endOffset) : this.posOf(domSel.focusNode, domSel.focusOffset);
    if (!anchor || !focus) return;
    const doc = this.engine.document;
    // What the page reports is already on the page, so it must not be written back to it.
    this.reading = true;
    try {
      this.engine.setSelection({ anchor: clampPos(doc, anchor), focus: clampPos(doc, focus) });
    } finally {
      this.reading = false;
    }
  }

  /**
   * A point on the page as a position in the document. Some browsers report a selection that spans whole blocks (select all, in Firefox)
   * as points on the editing surface itself, between its blocks, and one that spans table cells (a drag from cell to cell, in Firefox)
   * as points on a table row: those become the start of the block or cell after, or the end of the last one before the end of the node.
   */
  private posOf(node: Node, offset: number): Pos | null {
    const direct = node !== this.element ? posFromDom(this.element, node, offset) : null;
    if (direct || !(node instanceof Element)) return direct;
    const containers = (el: Element): Element[] => (el.hasAttribute("data-rte") ? [el, ...el.querySelectorAll("[data-rte]")] : [...el.querySelectorAll("[data-rte]")]);
    const at = node.children[offset];
    const first = at ? containers(at)[0] : undefined;
    if (first) return posFromDom(this.element, first, 0);
    const all = containers(node);
    const last = all[all.length - 1];
    return last ? posFromDom(this.element, last, last.childNodes.length) : null;
  }

  private writeSelection(): void {
    const domSel = document.getSelection();
    if (!domSel || (document.activeElement !== this.element && !this.element.contains(document.activeElement))) return;
    const a = domFromPos(this.element, this.engine.selection.anchor);
    const f = domFromPos(this.element, this.engine.selection.focus);
    if (a && f) domSel.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
  }

  /** Runs one edit as a history step. Edits of one kind in a row (typing, deleting) share a step. */
  private apply(kind: string, op: (doc: Doc, sel: Selection) => EditResult): boolean {
    return this.engine.apply(kind, op);
  }

  /** After an input method finishes, take the text it produced, and where it left the caret, from the DOM. */
  private reconcileFromDom(): void {
    this.readSelection();
    const path = this.engine.selection.focus.path;
    const container = containerAt(this.element, path);
    if (!container) return;
    const clone = container.cloneNode(true) as Element;
    clone.querySelectorAll("ul, ol, [data-rte-ph], [data-rte-check], [data-rte-caption]").forEach((n) => n.remove());
    const first = importBlocks(`<p>${clone.innerHTML}</p>`, { ...this.engine.importOptions, styles: "allowlist", keepEmptyBlocks: true })[0];
    if (!first || (first.type !== "p" && first.type !== "h")) return;
    if (JSON.stringify(first.content) === JSON.stringify(getContent(this.engine.document, path))) return;
    // The browser has already changed the DOM, so the caret is read from it before the model catches up.
    const domSel = document.getSelection();
    const raw = domSel?.focusNode && this.element.contains(domSel.focusNode) ? posFromDom(this.element, domSel.focusNode, domSel.focusOffset) : null;
    this.apply("type", (doc) => {
      const next = setContent(doc, path, first.content);
      return { doc: next, selection: raw ? caret(clampPos(next, raw)) : caret(clampPos(next, this.engine.selection.focus)) };
    });
  }

  private onBeforeInput(event: InputEvent): void {
    if (this.composing || event.isComposing) return;
    if (this.engine.readOnly) { event.preventDefault(); return; }
    const type = event.inputType;
    const handled = ((): boolean => {
      switch (type) {
        case "insertText": {
          const data = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
          if (data.includes("\n")) { this.paste({ text: data }); return true; }
          // A plugin may take typed text over (a list shortcut, say); its conversion is an undo step of its own.
          const taken = this.engine.triggerText(data);
          if (taken) {
            this.apply("pattern", () => taken);
            if (taken.storedMarks) this.engine.setStoredMarks(taken.storedMarks);
            return true;
          }
          this.apply("type", (doc, sel) => insertText(doc, sel, data, this.engine.storedMarks));
          return true;
        }
        case "insertParagraph": this.apply("split", (doc, sel) => splitBlock(doc, sel, this.engine.behaviors)); return true;
        case "insertLineBreak": this.apply("break", insertLineBreak); return true;
        case "deleteContentBackward": this.apply("delete", (doc, sel) => deleteBackward(doc, sel, this.engine.behaviors)); return true;
        case "deleteContentForward": this.apply("delete", deleteForward); return true;
        case "deleteWordBackward": this.apply("delete", (doc, sel) => deleteWord(doc, sel, "backward", this.engine.behaviors)); return true;
        case "deleteWordForward": this.apply("delete", (doc, sel) => deleteWord(doc, sel, "forward", this.engine.behaviors)); return true;
        case "deleteHardLineBackward": this.apply("delete", (doc, sel) => deleteToEdge(doc, sel, "backward")); return true;
        case "deleteHardLineForward": this.apply("delete", (doc, sel) => deleteToEdge(doc, sel, "forward")); return true;
        // A soft line is a line as the page wraps it, so where it begins and ends is asked of the page.
        case "deleteSoftLineBackward": this.deleteVisualLine("backward"); return true;
        case "deleteSoftLineForward": this.deleteVisualLine("forward"); return true;
        case "deleteEntireSoftLine": this.deleteVisualLine("both"); return true;
        case "deleteContent": this.apply("delete", deleteSelection); return true;
        case "insertTranspose": this.apply("transpose", transposeChars); return true;
        case "insertFromYank": {
          const text = event.dataTransfer?.getData("text/plain") || event.data || "";
          if (text !== "") this.apply("type", (doc, sel) => insertText(doc, sel, text.replace(/\r?\n/g, " ")));
          return true;
        }
        case "deleteByCut": case "deleteByDrag": this.apply("cut", deleteSelection); return true;
        case "historyUndo": this.undo(); return true;
        case "historyRedo": this.redo(); return true;
        case "formatBold": this.toggle("bold"); return true;
        case "formatItalic": this.toggle("italic"); return true;
        case "formatUnderline": this.toggle("underline"); return true;
        case "formatStrikeThrough": this.toggle("strike"); return true;
        case "insertReplacementText": {
          // A spelling correction replaces the word the browser targeted, which need not be where the caret is.
          // `||`, not `??`: a data transfer with no text must not turn a correction into a deletion.
          const text = event.dataTransfer?.getData("text/plain") || event.data || "";
          if (text === "") return true;
          const range = event.getTargetRanges()[0];
          const from = range ? posFromDom(this.element, range.startContainer, range.startOffset) : null;
          const to = range ? posFromDom(this.element, range.endContainer, range.endOffset) : null;
          this.apply("type", (doc, sel) => insertText(doc, from && to ? { anchor: from, focus: to } : sel, text));
          return true;
        }
        case "insertFromPaste": case "insertFromPasteAsQuotation": {
          const text = event.dataTransfer?.getData("text/plain");
          if (text) this.paste({ text, ...(event.dataTransfer?.getData("text/html") ? { html: event.dataTransfer.getData("text/html") } : {}) });
          return true;
        }
        default: {
          // Formatting the browser asks for by name (from a context menu, a spell checker, a screen reader) runs the matching command.
          const mapped = INPUT_COMMANDS[type];
          if (mapped && this.engine.commands.list().some((c) => c.name === mapped[0])) {
            const arg = mapped[1] === "data" ? (event.data ?? event.dataTransfer?.getData("text/plain") ?? "") : mapped[1] === "href" ? { href: event.data ?? "" } : mapped[1];
            this.engine.commands.run(mapped[0], arg);
            return true;
          }
          this.unhandled?.(type);
          return false;
        }
      }
    })();
    // Anything not handled above is blocked rather than left to the browser, which would edit the DOM behind the model's back.
    event.preventDefault();
    void handled;
  }

  /**
   * Deletes to the start or end of the line the caret is on as the page lays it out (or both, for the whole line). The page knows where
   * a line wraps; the browser's own selection movement is asked to move to the line boundary, and the result is read back as positions.
   * A selection is deleted as it is.
   */
  private deleteVisualLine(which: "backward" | "forward" | "both"): void {
    this.readSelection();
    const sel = this.engine.selection;
    if (!isCollapsed(sel)) { this.apply("delete", deleteSelection); return; }
    const domSel = document.getSelection();
    const at = domFromPos(this.element, sel.focus);
    if (!domSel || !at) { this.apply("delete", (doc, s) => deleteToEdge(doc, s, which === "forward" ? "forward" : "backward")); return; }
    const edge = (direction: "backward" | "forward"): Pos | null => {
      domSel.collapse(at.node, at.offset);
      domSel.modify("extend", direction, "lineboundary");
      const found = domSel.focusNode ? this.posOf(domSel.focusNode, domSel.focusOffset) : null;
      domSel.collapse(at.node, at.offset);
      return found;
    };
    const start = which === "forward" ? sel.focus : edge("backward") ?? { path: sel.focus.path, offset: 0 };
    const end = which === "backward" ? sel.focus : edge("forward") ?? sel.focus;
    // The line can run into the next container (a wrapped line ends where the block does); stay in this container.
    const clampedStart = start.path.join(".") === sel.focus.path.join(".") ? start : { path: sel.focus.path, offset: 0 };
    const clampedEnd = end.path.join(".") === sel.focus.path.join(".") ? end : { path: sel.focus.path, offset: inlineLength(getContent(this.engine.document, sel.focus.path)) };
    this.apply("delete", (doc) => deleteSelection(doc, { anchor: clampedStart, focus: clampedEnd }));
  }

  private onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    if (this.engine.readOnly) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const html = clipboard.getData("text/html");
    const text = clipboard.getData("text/plain");
    const rtf = clipboard.getData("text/rtf");
    if (!html && !text && clipboard.files.length > 0) {
      void this.pasteFiles([...clipboard.files]);
      return;
    }
    this.paste({
      ...(html ? { html } : {}), ...(text ? { text } : {}), ...(rtf ? { rtf } : {}),
      types: [...clipboard.types],
    });
  }

  /** Copy and cut write the model's own HTML and text, not the page's markup. */
  private onCopy(event: ClipboardEvent, cut: boolean): void {
    this.readSelection();
    if (isCollapsed(this.engine.selection) || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/html", exportHtml({ blocks: extractSelection(this.engine.document, this.engine.selection) }));
    event.clipboardData.setData("text/plain", selectedText(this.engine.document, this.engine.selection));
    if (cut && !this.engine.readOnly) this.apply("cut", deleteSelection);
  }

  private onDragStart(event: DragEvent): void {
    // Dragging a picture drags that picture, whatever selection the browser made when it was pressed.
    const dragged = event.target;
    if (dragged instanceof HTMLImageElement && this.element.contains(dragged) && dragged.parentNode) {
      const at = posFromDom(this.element, dragged.parentNode, [...dragged.parentNode.childNodes].indexOf(dragged as ChildNode));
      if (at) this.engine.setSelection(imageSelection(at.path, at.offset));
    } else this.readSelection();
    if (isCollapsed(this.engine.selection) || !event.dataTransfer) return;
    event.dataTransfer.setData("text/html", exportHtml({ blocks: extractSelection(this.engine.document, this.engine.selection) }));
    event.dataTransfer.setData("text/plain", selectedText(this.engine.document, this.engine.selection));
    event.dataTransfer.effectAllowed = this.engine.readOnly ? "copy" : "copyMove";
    this.dragSource = this.engine.selection;
  }

  private onDragOver(event: DragEvent): void {
    if (this.engine.readOnly) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.dragSource && !(event.ctrlKey || event.altKey) ? "move" : "copy";
  }

  private onDrop(event: DragEvent): void {
    event.preventDefault();
    const source = this.dragSource;
    this.dragSource = null;
    if (this.engine.readOnly || !event.dataTransfer) return;
    const target = this.positionAt(event.clientX, event.clientY);
    if (!target) return;
    if (source) {
      this.apply("drop", (doc) => moveSelection(doc, source, target, event.ctrlKey || event.altKey, this.engine.behaviors));
      return;
    }
    this.setSelection(caret(target));
    const data = event.dataTransfer;
    const html = data.getData("text/html");
    const text = data.getData("text/plain");
    if (html || text) this.paste({ ...(html ? { html } : {}), ...(text ? { text } : {}), types: [...data.types] });
    else void this.pasteFiles([...data.files]);
  }

  /** The document position under a screen point, using whichever caret-from-point call the browser has. */
  private positionAt(x: number, y: number): Pos | null {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const point = doc.caretPositionFromPoint?.(x, y);
    const range = point ? null : doc.caretRangeFromPoint?.(x, y);
    const node = point?.offsetNode ?? range?.startContainer;
    const offset = point?.offset ?? range?.startOffset;
    if (!node || offset === undefined || !this.element.contains(node)) return null;
    const pos = posFromDom(this.element, node, offset);
    return pos ? clampPos(this.engine.document, pos) : null;
  }

  /** Pasted and dropped files go to the plugins that handle files (the image policy, say). Without one they are ignored. */
  private async pasteFiles(files: readonly File[]): Promise<void> {
    for (const handler of this.engine.fileHandlers) {
      const blocks = await handler(files);
      if (blocks && blocks.length > 0) {
        this.apply("paste", (doc, sel) => insertBlocks(doc, sel, blocks, this.engine.behaviors));
        return;
      }
    }
  }

  /** Keys go through the key map: a chord bound to a command runs it, and the event is stopped if the command changed something. */
  private onKeyDown(event: KeyboardEvent): void {
    if (this.composing || event.isComposing) return;
    if (this.engine.handleKey(event)) event.preventDefault();
  }
}
