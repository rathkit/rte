// The editing surface. The document model is the source of truth: the view intercepts the browser's
// input events, applies each one to the model, then draws the model back. The browser never edits the
// document itself, so Chromium, Firefox and WebKit all end up with the same result.
import {
  caret, clampPos, deleteBackward, deleteForward, deleteSelection, deleteToEdge, deleteWord, extractSelection, insertBlocks, insertLineBreak,
  insertText, isCollapsed, moveSelection, selectedText, splitBlock, startOf, toggleMark, type EditResult,
} from "../edit.ts";
import { exportHtml } from "../export.ts";
import { checkImageSrc, importBlocks, importHtml } from "../import.ts";
import { emptyDoc, type Block, type Doc, type MarkType } from "../model.ts";
import { pasteBlocks, type ClipboardData, type PasteHandler } from "../paste.ts";
import { getContent, setContent, type Pos, type Selection } from "../path.ts";
import { containerAt, createRenderCache, domFromPos, posFromDom, renderDoc } from "./render.ts";

export interface EditorOptions {
  readonly element: HTMLElement;
  readonly html?: string;
  readonly pasteHandlers?: readonly PasteHandler[];
  readonly readOnly?: boolean;
  /** Draw remote (`http`, `https`) images. Off by default, so pasting never makes the browser fetch anything. */
  readonly loadRemoteImages?: boolean;
  /** Called with the `inputType` of input the editor does not handle. That input is blocked, not applied. */
  readonly onUnhandledInput?: (inputType: string) => void;
  /** Largest image file, in bytes, that a paste or drop turns into an inline image. */
  readonly maxImageFileBytes?: number;
}

interface Level {
  readonly doc: Doc;
  readonly selection: Selection;
}

type Listener = (editor: Editor) => void;

export class Editor {
  readonly element: HTMLElement;
  private current: Doc = emptyDoc;
  private sel: Selection = caret(startOf(emptyDoc));
  private undoStack: Level[] = [];
  private redoStack: Level[] = [];
  private lastKind = "";
  private composing = false;
  private readOnlyMode: boolean;
  private readonly loadRemoteImages: boolean;
  private readonly unhandled: ((inputType: string) => void) | undefined;
  private readonly maxImageBytes: number;
  private dragSource: Selection | null = null;
  private readonly renderCache = createRenderCache();
  /** Notices changes to the page that the editor did not make, so the block they touched is drawn again from the model. */
  private readonly observer = new MutationObserver((records) => {
    for (const record of records) {
      let node: Node | null = record.target;
      while (node && node.parentNode !== this.element) node = node.parentNode;
      if (node) this.renderCache.dirty.add(node);
    }
  });
  private readonly handlers: readonly PasteHandler[];
  private readonly listeners = new Set<Listener>();
  private readonly cleanups: (() => void)[] = [];

  constructor(options: EditorOptions) {
    this.element = options.element;
    this.handlers = options.pasteHandlers ?? [];
    this.readOnlyMode = options.readOnly ?? false;
    this.loadRemoteImages = options.loadRemoteImages ?? false;
    this.unhandled = options.onUnhandledInput;
    this.maxImageBytes = options.maxImageFileBytes ?? 4_000_000;
    this.element.setAttribute("contenteditable", this.readOnlyMode ? "false" : "true");
    this.element.setAttribute("role", "textbox");
    this.element.setAttribute("aria-multiline", "true");
    this.element.style.whiteSpace = "pre-wrap";
    this.current = importHtml(options.html ?? "");
    this.sel = caret(startOf(this.current));
    this.draw();
    this.listen(this.element, "beforeinput", (e) => this.onBeforeInput(e as InputEvent));
    this.listen(this.element, "paste", (e) => this.onPaste(e as ClipboardEvent));
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
  }

  // ---- state ----------------------------------------------------------------------------------------------

  get doc(): Doc { return this.current; }
  get selection(): Selection { return this.sel; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get readOnly(): boolean { return this.readOnlyMode; }

  getHtml(): string { return exportHtml(this.current); }

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
    visit(this.current.blocks);
    return found;
  }

  /** Replaces the whole document and empties the history. */
  setHtml(html: string): void {
    this.current = importHtml(html);
    this.sel = caret(startOf(this.current));
    this.undoStack = [];
    this.redoStack = [];
    this.lastKind = "";
    this.draw();
    this.emit();
  }

  setReadOnly(value: boolean): void {
    this.readOnlyMode = value;
    this.element.setAttribute("contenteditable", value ? "false" : "true");
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.listeners.clear();
    this.observer.disconnect();
  }

  focus(): void { this.element.focus(); }

  /** Sets the selection from two DOM points (used by hosts and tests). */
  selectDom(anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number): void {
    const domSel = document.getSelection();
    domSel?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
    this.readSelection();
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
    this.apply("format", (doc, sel) => toggleMark(doc, sel, { type: mark } as never));
  }

  undo(): void {
    const level = this.undoStack.pop();
    if (!level) return;
    this.redoStack.push({ doc: this.current, selection: this.sel });
    this.current = level.doc;
    this.sel = level.selection;
    this.lastKind = "";
    this.draw();
    this.emit();
  }

  redo(): void {
    const level = this.redoStack.pop();
    if (!level) return;
    this.undoStack.push({ doc: this.current, selection: this.sel });
    this.current = level.doc;
    this.sel = level.selection;
    this.lastKind = "";
    this.draw();
    this.emit();
  }

  /** Pastes raw clipboard data through the same pipeline a paste event uses. */
  paste(data: ClipboardData): void {
    const blocks = pasteBlocks(data, this.handlers);
    if (blocks.length === 0) return;
    this.apply("paste", (doc, sel) => insertBlocks(doc, sel, blocks));
  }

  // ---- plumbing -------------------------------------------------------------------------------------------

  private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this);
  }

  private draw(): void {
    renderDoc(this.current, this.element, { loadRemoteImages: this.loadRemoteImages }, this.renderCache);
    // Changes drawing just made are not disturbances; throw their records away.
    this.observer.takeRecords();
    this.writeSelection();
  }

  private setSelection(sel: Selection): void {
    this.sel = { anchor: clampPos(this.current, sel.anchor), focus: clampPos(this.current, sel.focus) };
    this.writeSelection();
  }

  private readSelection(): void {
    const domSel = document.getSelection();
    if (!domSel || domSel.rangeCount === 0 || !domSel.anchorNode || !domSel.focusNode) return;
    if (!this.element.contains(domSel.anchorNode) || !this.element.contains(domSel.focusNode)) return;
    const anchor = posFromDom(this.element, domSel.anchorNode, domSel.anchorOffset);
    const focus = posFromDom(this.element, domSel.focusNode, domSel.focusOffset);
    if (anchor && focus) this.sel = { anchor: clampPos(this.current, anchor), focus: clampPos(this.current, focus) };
  }

  private writeSelection(): void {
    const domSel = document.getSelection();
    if (!domSel || (document.activeElement !== this.element && !this.element.contains(document.activeElement))) return;
    const a = domFromPos(this.element, this.sel.anchor);
    const f = domFromPos(this.element, this.sel.focus);
    if (a && f) domSel.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
  }

  /** Runs one edit. Neighbouring edits of the same kind share one undo level, so a burst of typing undoes at once. */
  private apply(kind: string, op: (doc: Doc, sel: Selection) => EditResult): void {
    if (this.readOnlyMode) return;
    this.readSelection();
    const before: Level = { doc: this.current, selection: this.sel };
    const result = op(this.current, this.sel);
    if (result.doc === this.current && result.selection === this.sel) return;
    const groups = kind === "type" || kind === "delete";
    if (!(groups && this.lastKind === kind)) {
      this.undoStack.push(before);
      if (this.undoStack.length > 200) this.undoStack.shift();
    }
    this.lastKind = kind;
    this.redoStack = [];
    this.current = result.doc;
    this.sel = result.selection;
    this.draw();
    this.emit();
  }

  /** After an input method finishes, take the text it produced, and where it left the caret, from the DOM. */
  private reconcileFromDom(): void {
    this.readSelection();
    const path = this.sel.focus.path;
    const container = containerAt(this.element, path);
    if (!container) return;
    const clone = container.cloneNode(true) as Element;
    clone.querySelectorAll("ul, ol, [data-rte-ph]").forEach((n) => n.remove());
    const first = importBlocks(`<p>${clone.innerHTML}</p>`, { styles: "allowlist", keepEmptyBlocks: true })[0];
    if (!first || (first.type !== "p" && first.type !== "h")) return;
    if (JSON.stringify(first.content) === JSON.stringify(getContent(this.current, path))) return;
    // The browser has already changed the DOM, so the caret is read from it before the model catches up.
    const domSel = document.getSelection();
    const raw = domSel?.focusNode && this.element.contains(domSel.focusNode) ? posFromDom(this.element, domSel.focusNode, domSel.focusOffset) : null;
    this.apply("type", (doc) => {
      const next = setContent(doc, path, first.content);
      return { doc: next, selection: raw ? caret(clampPos(next, raw)) : caret(clampPos(next, this.sel.focus)) };
    });
  }

  private onBeforeInput(event: InputEvent): void {
    if (this.composing || event.isComposing) return;
    if (this.readOnlyMode) { event.preventDefault(); return; }
    const type = event.inputType;
    const handled = ((): boolean => {
      switch (type) {
        case "insertText": {
          const data = event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
          if (data.includes("\n")) { this.paste({ text: data }); return true; }
          this.apply("type", (doc, sel) => insertText(doc, sel, data));
          return true;
        }
        case "insertParagraph": this.apply("split", splitBlock); return true;
        case "insertLineBreak": this.apply("break", insertLineBreak); return true;
        case "deleteContentBackward": this.apply("delete", deleteBackward); return true;
        case "deleteContentForward": this.apply("delete", deleteForward); return true;
        case "deleteWordBackward": this.apply("delete", (doc, sel) => deleteWord(doc, sel, "backward")); return true;
        case "deleteWordForward": this.apply("delete", (doc, sel) => deleteWord(doc, sel, "forward")); return true;
        case "deleteSoftLineBackward": case "deleteHardLineBackward": this.apply("delete", (doc, sel) => deleteToEdge(doc, sel, "backward")); return true;
        case "deleteSoftLineForward": case "deleteHardLineForward": this.apply("delete", (doc, sel) => deleteToEdge(doc, sel, "forward")); return true;
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
        default:
          this.unhandled?.(type);
          return false;
      }
    })();
    // Anything not handled above is blocked rather than left to the browser, which would edit the DOM behind the model's back.
    event.preventDefault();
    void handled;
  }

  private onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    if (this.readOnlyMode) return;
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
    if (isCollapsed(this.sel) || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData("text/html", exportHtml({ blocks: extractSelection(this.current, this.sel) }));
    event.clipboardData.setData("text/plain", selectedText(this.current, this.sel));
    if (cut && !this.readOnlyMode) this.apply("cut", deleteSelection);
  }

  private onDragStart(event: DragEvent): void {
    this.readSelection();
    if (isCollapsed(this.sel) || !event.dataTransfer) return;
    event.dataTransfer.setData("text/html", exportHtml({ blocks: extractSelection(this.current, this.sel) }));
    event.dataTransfer.setData("text/plain", selectedText(this.current, this.sel));
    event.dataTransfer.effectAllowed = this.readOnlyMode ? "copy" : "copyMove";
    this.dragSource = this.sel;
  }

  private onDragOver(event: DragEvent): void {
    if (this.readOnlyMode) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.dragSource && !(event.ctrlKey || event.altKey) ? "move" : "copy";
  }

  private onDrop(event: DragEvent): void {
    event.preventDefault();
    const source = this.dragSource;
    this.dragSource = null;
    if (this.readOnlyMode || !event.dataTransfer) return;
    const target = this.positionAt(event.clientX, event.clientY);
    if (!target) return;
    if (source) {
      this.apply("drop", (doc) => moveSelection(doc, source, target, event.ctrlKey || event.altKey));
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
    return pos ? clampPos(this.current, pos) : null;
  }

  /** Image files become inline images, after the same address check the importer applies. Anything else is ignored. */
  private async pasteFiles(files: readonly File[]): Promise<void> {
    const blocks: Block[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > this.maxImageBytes) continue;
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
      const src = checkImageSrc(url);
      if (src) blocks.push({ type: "p", content: [{ type: "image", src }] });
    }
    if (blocks.length > 0) this.apply("paste", (doc, sel) => insertBlocks(doc, sel, blocks));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.composing || event.isComposing) return;
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.altKey) return;
    const key = event.key.toLowerCase();
    const run = (fn: () => void): void => { event.preventDefault(); fn(); };
    if (key === "b") run(() => this.toggle("bold"));
    else if (key === "i") run(() => this.toggle("italic"));
    else if (key === "u") run(() => this.toggle("underline"));
    else if (key === "z" && !event.shiftKey) run(() => this.undo());
    else if ((key === "z" && event.shiftKey) || key === "y") run(() => this.redo());
  }
}
