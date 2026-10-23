// The editing surface. The document model is the source of truth: the view intercepts the browser's
// input events, applies each one to the model, then draws the model back. The browser never edits the
// document itself, so Chromium, Firefox and WebKit all end up with the same result.
import { createEngine } from "../core.ts";
import {
  caret, clampPos, deleteBackward, deleteForward, deleteSelection, deleteToEdge, deleteWord, extractSelection, insertBlocks, insertLineBreak,
  insertText, isCollapsed, moveSelection, selectedText, splitBlock, type EditResult,
} from "../edit.ts";
import type { Engine } from "../engine.ts";
import { exportHtml } from "../export.ts";
import { inDefinitionList } from "../definitions.ts";
import { inList, listShortcut, type ListOptions } from "../lists.ts";
import { collectImages, isDataImage, mapImages, readDataImage, rewriteImages } from "../images.ts";
import { checkImageSrc, importBlocks, importHtml } from "../import.ts";
import { encodeBase64, sanitizeSvg } from "../svg.ts";
import type { Block, Doc, MarkType } from "../model.ts";
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
  /**
   * Stores an image on the host's own server and returns its address. When set, pasted and dropped raster images are
   * uploaded instead of being embedded in the document, so documents stay small. Nothing is sent anywhere without it.
   */
  readonly uploadImage?: (file: Blob, info: { readonly name: string; readonly type: string; readonly size: number }) => Promise<string>;
  /** Largest raster image, in bytes, that is embedded in the document when there is no `uploadImage`. Default 512 KB. */
  readonly maxInlineImageBytes?: number;
  /** Tab and Shift+Tab move list items in and out. Off: the browser keeps Tab for moving focus. Default on. */
  readonly indentOnTab?: boolean;
  /** Deepest allowed nesting of lists. Default: no limit. */
  readonly maxListDepth?: number;
  /** Typing `* `, `- ` or `1. ` at the start of a paragraph starts a list. Default on. */
  readonly listShortcuts?: boolean;
  /** Largest image file the editor will read at all, in bytes. Default 20 MB. */
  readonly maxImageFileBytes?: number;
  /** Called when an image is left out, with the reason, so the host can tell the person. */
  readonly onImageRejected?: (info: { readonly reason: "too-large" | "unsupported" | "upload-failed"; readonly type: string; readonly size: number }) => void;
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
  private readonly maxImageBytes: number;
  private readonly maxInlineBytes: number;
  private readonly upload: EditorOptions["uploadImage"];
  private readonly rejected: EditorOptions["onImageRejected"];
  private dragSource: Selection | null = null;
  private readonly listShortcuts: boolean;
  private readonly renderCache = createRenderCache();
  /** Notices changes to the page that the editor did not make, so the block they touched is drawn again from the model. */
  private readonly observer = new MutationObserver((records) => {
    for (const record of records) {
      let node: Node | null = record.target;
      while (node && node.parentNode !== this.element) node = node.parentNode;
      if (node) this.renderCache.dirty.add(node);
    }
  });
  private readonly cleanups: (() => void)[] = [];

  constructor(options: EditorOptions) {
    this.element = options.element;
    this.loadRemoteImages = options.loadRemoteImages ?? false;
    this.unhandled = options.onUnhandledInput;
    this.listShortcuts = options.listShortcuts ?? true;
    this.engine = createEngine({
      doc: importHtml(options.html ?? ""),
      readOnly: options.readOnly ?? false,
      ...(options.maxListDepth !== undefined ? { maxListDepth: options.maxListDepth } : {}),
      indentOnTab: options.indentOnTab ?? true,
      // Before the engine reads the selection, bring it up to date from the page; asked to focus, focus the page.
      beforeAccess: () => this.readSelection(),
      focus: () => this.element.focus(),
    });
    this.engine.pasteHandlers.push(...(options.pasteHandlers ?? []));
    this.maxImageBytes = options.maxImageFileBytes ?? 20_000_000;
    this.maxInlineBytes = options.maxInlineImageBytes ?? 512 * 1024;
    this.upload = options.uploadImage;
    this.rejected = options.onImageRejected;
    this.element.setAttribute("contenteditable", this.engine.readOnly ? "false" : "true");
    this.element.setAttribute("role", "textbox");
    this.element.setAttribute("aria-multiline", "true");
    this.element.style.whiteSpace = "pre-wrap";
    this.draw();
    // The page follows the model: after every change to the document it is drawn again, and a selection the editor set (not one
    // the page reported) is written to the page.
    this.cleanups.push(this.engine.onTransaction((_snapshot, _previous, change) => {
      if (change.docChanged) this.draw();
      else if (change.selectionChanged && !this.reading) this.writeSelection();
    }));
    this.listen(this.element, "focusin", () => this.engine.setFocused(true));
    this.listen(this.element, "focusout", () => this.engine.setFocused(false));
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

  get doc(): Doc { return this.engine.document; }
  get selection(): Selection { return this.engine.selection; }
  get canUndo(): boolean { return this.engine.canUndo; }
  get canRedo(): boolean { return this.engine.canRedo; }
  get readOnly(): boolean { return this.engine.readOnly; }

  /** Named commands and their state: `editor.commands.run("format.bold")`, `editor.commands.state("format.bold")`. */
  get commands(): Engine["commands"] { return this.engine.commands; }
  /** Key chords and the commands they run. */
  get keymap(): Engine["keymap"] { return this.engine.keymap; }
  /** The current immutable state. */
  get snapshot(): Engine["snapshot"] { return this.engine.snapshot; }
  subscribe: Engine["subscribe"] = (listener) => this.engine.subscribe(listener);
  select: Engine["select"] = (selector, onChange, equals) => this.engine.select(selector, onChange, equals);
  /** Adds a plugin. Returns a function that removes it. */
  use: Engine["use"] = (plugin) => this.engine.use(plugin);

  getHtml(): string { return exportHtml(this.engine.document); }

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

  /** Replaces the whole document and empties the history. */
  setHtml(html: string): void {
    this.engine.setDocument(importHtml(html));
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
    const names = { bold: "format.bold", italic: "format.italic", underline: "format.underline", strike: "format.strike", code: "format.code", sup: "format.superscript", sub: "format.subscript" } as const;
    if (mark in names) this.engine.commands.run(names[mark as keyof typeof names]);
  }

  /** Makes the selected blocks a bulleted or numbered list, or takes them out of it. */
  toggleList(type: "ul" | "ol", options?: ListOptions): void {
    this.engine.commands.run(type === "ul" ? "list.bulleted" : "list.numbered", options);
  }
  /** Makes the selected blocks terms of a definition list, or takes them out of it. */
  toggleDefinitionList(): void { this.engine.commands.run("list.definition"); }
  /** In a list, nests the selected items. In a definition list, makes the selected terms details. */
  indent(): void { this.engine.commands.run("list.indent"); }
  /** In a list, moves the selected items out. In a definition list, makes the selected details terms. */
  outdent(): void { this.engine.commands.run("list.outdent"); }

  /** True when the caret is in a definition list. */
  isInDefinitionList(): boolean {
    this.readSelection();
    return inDefinitionList(this.engine.document, this.engine.selection.focus.path);
  }

  /** True when the caret is in a list item, of the given type if one is given. */
  isInList(type?: "ul" | "ol"): boolean {
    this.readSelection();
    return inList(this.engine.document, this.engine.selection.focus.path, type);
  }

  undo(): void { this.engine.undo(); }
  redo(): void { this.engine.redo(); }

  /** Pastes raw clipboard data through the same pipeline a paste event uses. */
  paste(data: ClipboardData): void {
    const blocks = pasteBlocks(data, this.engine.pasteHandlers);
    if (blocks.length === 0) return;
    this.insertSettled(blocks);
  }

  /**
   * Inserts blocks after dealing with the images that came inside them as data addresses: with an upload function they
   * are uploaded first, otherwise ones over the inline limit are left out. Without large images this is synchronous.
   */
  private insertSettled(blocks: readonly Block[]): void {
    const embedded = collectImages(blocks).filter((image) => isDataImage(image) && !/^data:image\/svg/i.test(image.src));
    if (embedded.length === 0) {
      this.apply("paste", (doc, sel) => insertBlocks(doc, sel, blocks));
    } else if (this.upload) {
      this.readSelection();
      const at = this.engine.selection;
      void rewriteImages(blocks, async (image) => this.uploadEmbedded(image)).then((settled) => {
        this.apply("paste", (doc) => insertBlocks(doc, { anchor: clampPos(doc, at.anchor), focus: clampPos(doc, at.focus) }, settled));
      });
    } else {
      const kept = mapImages(blocks, (image) => (this.fitsInline(image) ? image : undefined));
      this.apply("paste", (doc, sel) => insertBlocks(doc, sel, kept));
    }
  }

  private fitsInline(image: { readonly src: string }): boolean {
    const info = readDataImage(image.src);
    if (!info || info.bytes.length <= this.maxInlineBytes) return true;
    this.rejected?.({ reason: "too-large", type: info.type, size: info.bytes.length });
    return false;
  }

  private async uploadEmbedded<T extends { readonly src: string }>(image: T): Promise<T | undefined> {
    const info = readDataImage(image.src);
    if (!info || !this.upload) return image;
    return this.uploadFile(new Blob([info.bytes as BlobPart], { type: info.type }), "image", image);
  }

  private async uploadFile<T extends { readonly src: string }>(file: Blob, name: string, image: T): Promise<T | undefined> {
    try {
      const url = await this.upload?.(file, { name, type: file.type, size: file.size });
      const checked = url ? checkImageSrc(url) : undefined;
      if (checked) return { ...image, src: checked };
      this.rejected?.({ reason: "unsupported", type: file.type, size: file.size });
    } catch {
      this.rejected?.({ reason: "upload-failed", type: file.type, size: file.size });
    }
    return undefined;
  }

  // ---- plumbing -------------------------------------------------------------------------------------------

  private listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  private draw(): void {
    renderDoc(this.engine.document, this.element, { loadRemoteImages: this.loadRemoteImages }, this.renderCache);
    // Changes drawing just made are not disturbances; throw their records away.
    this.observer.takeRecords();
    this.writeSelection();
  }

  private setSelection(sel: Selection): void {
    this.engine.setSelection({ anchor: clampPos(this.engine.document, sel.anchor), focus: clampPos(this.engine.document, sel.focus) });
  }

  private readSelection(): void {
    const domSel = document.getSelection();
    if (!domSel || domSel.rangeCount === 0 || !domSel.anchorNode || !domSel.focusNode) return;
    if (!this.element.contains(domSel.anchorNode) || !this.element.contains(domSel.focusNode)) return;
    const anchor = posFromDom(this.element, domSel.anchorNode, domSel.anchorOffset);
    const focus = posFromDom(this.element, domSel.focusNode, domSel.focusOffset);
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
    clone.querySelectorAll("ul, ol, [data-rte-ph]").forEach((n) => n.remove());
    const first = importBlocks(`<p>${clone.innerHTML}</p>`, { styles: "allowlist", keepEmptyBlocks: true })[0];
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
          if (data === " " && this.listShortcuts) {
            // A shortcut such as "* " starts a list; its conversion is an undo step of its own.
            this.readSelection();
            const converted = listShortcut(this.engine.document, this.engine.selection);
            if (converted) {
              this.apply("pattern", () => converted);
              return true;
            }
          }
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
    this.readSelection();
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
    return pos ? clampPos(this.engine.document, pos) : null;
  }

  /**
   * Image files: SVG is cleaned and embedded; raster images are uploaded when the host gave an upload function, otherwise
   * embedded if small enough. The file's bytes must match its type. Anything else is ignored.
   */
  private async pasteFiles(files: readonly File[]): Promise<void> {
    const images = await Promise.all(files.map((file) => this.imageFromFile(file)));
    const blocks: Block[] = images.flatMap((image): Block[] => (image ? [{ type: "p", content: [image] }] : []));
    if (blocks.length > 0) this.apply("paste", (doc, sel) => insertBlocks(doc, sel, blocks));
  }

  private async imageFromFile(file: File): Promise<{ type: "image"; src: string; alt?: string } | undefined> {
    if (!file.type.startsWith("image/")) return undefined;
    const reject = (reason: "too-large" | "unsupported"): undefined => {
      this.rejected?.({ reason, type: file.type, size: file.size });
      return undefined;
    };
    if (file.size > this.maxImageBytes) return reject("too-large");
    if (file.type === "image/svg+xml") {
      const clean = sanitizeSvg(await file.text());
      return clean ? { type: "image", src: `data:image/svg+xml;base64,${encodeBase64(new TextEncoder().encode(clean))}` } : reject("unsupported");
    }
    // The first bytes must match the type the file claims before anything else is done with it.
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    if (!checkImageSrc(`data:${file.type};base64,${encodeBase64(head)}`)) return reject("unsupported");
    if (this.upload) return this.uploadFile(file, file.name, { type: "image" as const, src: "" });
    if (file.size > this.maxInlineBytes) return reject("too-large");
    const url = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(file);
    });
    const src = checkImageSrc(url);
    return src ? { type: "image", src } : reject("unsupported");
  }

  /** Keys go through the key map: a chord bound to a command runs it, and the event is stopped if the command changed something. */
  private onKeyDown(event: KeyboardEvent): void {
    if (this.composing || event.isComposing) return;
    if (this.engine.handleKey(event)) event.preventDefault();
  }
}
