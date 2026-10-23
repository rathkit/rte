// The editor's state machine, with no DOM: the document, the selection, history, read-only and focus, as immutable
// snapshots that can be subscribed to. The browser view drives this; so can a test, a server, or any other host.
import type { Behaviors, ContainerBehavior, ContainerKind, TextTrigger } from "./behaviors.ts";
import { CommandRegistry, type CommandDef, type Unsubscribe } from "./commands.ts";
import { detectPlatform, Keymap, type KeyBinding, type KeyEventLike, type Platform } from "./keymap.ts";
import { emptyDoc, type Doc, type Mark } from "./model.ts";
import type { PasteHandler } from "./paste.ts";
import { caret, isCollapsed, pathKey, type EditResult, type Path, type Selection } from "./path.ts";
import { startOf } from "./edit.ts";
import type { ImportOptions } from "./import.ts";
import { UiRegistry } from "./ui.ts";
import { PLUGIN_API_VERSION, satisfiesApi, type FileHandler, type PasteTransform, type Plugin, type PluginHost } from "./plugin.ts";
import { ops } from "./ops.ts";

export interface EditorSnapshot {
  /** Goes up on every change to the document, selection, read-only or focus state. */
  readonly version: number;
  readonly doc: Doc;
  readonly selection: Selection;
  readonly readOnly: boolean;
  readonly focused: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Marks the next typed text takes, chosen with the caret in place (bold switched on before typing). Undefined when none are chosen here. */
  readonly storedMarks: readonly Mark[] | undefined;
}

export interface EngineOptions {
  readonly doc?: Doc;
  readonly readOnly?: boolean;
  /** Decides what `Mod` means in key chords. Detected from the environment when not given. */
  readonly platform?: Platform;
  /** Called with warnings meant for developers, such as two plugins claiming one key. Default: the console. */
  readonly onWarning?: (message: string) => void;
  /** The host calls this before the engine reads state it also tracks elsewhere (a DOM selection, say). */
  readonly beforeAccess?: () => void;
  /** Asked to put the keyboard focus in the editor. */
  readonly focus?: () => void;
}

type Listener = (snapshot: EditorSnapshot, previous: EditorSnapshot) => void;
type Change = { readonly docChanged: boolean; readonly selectionChanged: boolean };

interface Level {
  readonly doc: Doc;
  readonly selection: Selection;
}

const sameSelection = (a: Selection, b: Selection): boolean =>
  a === b || (a.anchor.offset === b.anchor.offset && a.focus.offset === b.focus.offset && pathKey(a.anchor.path) === pathKey(b.anchor.path) && pathKey(a.focus.path) === pathKey(b.focus.path));

const MAX_HISTORY = 200;

export class Engine {
  readonly commands: CommandRegistry;
  readonly keymap: Keymap;
  /** Interface items that plugins and the editor offer, by place. Read by a user interface; the engine never draws them. */
  readonly ui = new UiRegistry();
  /** Handlers that see the raw clipboard before the built-in paste handling does. */
  readonly pasteHandlers: PasteHandler[] = [];
  /** How plugins want Enter, Backspace and paste to work in the containers they own. Empty without plugins. */
  readonly behaviors: Behaviors = {};
  private readonly textTriggers: TextTrigger[] = [];
  /** Plugins that change pasted blocks before they go in. */
  readonly pasteTransforms: PasteTransform[] = [];
  /** Plugins that turn pasted and dropped files into blocks. */
  readonly fileHandlers: FileHandler[] = [];
  /** How HTML is imported here: what plugins have added (an SVG cleaner, recognizers). Pass it to the importer. */
  readonly importOptions: { sanitizeSvg?: ImportOptions["sanitizeSvg"]; recognizers: NonNullable<ImportOptions["recognizers"]> } = { recognizers: [] };

  private doc: Doc;
  private sel: Selection;
  private undoStack: Level[] = [];
  private redoStack: Level[] = [];
  private lastKind = "";
  private stored: { readonly path: Path; readonly offset: number; readonly marks: readonly Mark[] } | undefined;
  private readOnlyMode: boolean;
  private focusedState = false;
  private version = 0;
  private current: EditorSnapshot;
  private notified: EditorSnapshot;
  private scheduled = false;
  private readonly listeners = new Set<Listener>();
  private readonly selectors = new Set<{ select: (s: EditorSnapshot) => unknown; equals: (a: unknown, b: unknown) => boolean; last: unknown; onChange: (v: never) => void }>();
  private readonly hooks = new Set<(snapshot: EditorSnapshot, previous: EditorSnapshot, change: Change) => void>();
  private readonly plugins = new Map<string, () => void>();
  private readonly beforeAccess: (() => void) | undefined;
  private readonly focusRequest: (() => void) | undefined;
  readonly warn: (message: string) => void;

  constructor(options: EngineOptions = {}) {
    this.doc = options.doc ?? emptyDoc;
    this.sel = caret(startOf(this.doc));
    this.readOnlyMode = options.readOnly ?? false;
    this.beforeAccess = options.beforeAccess;
    this.focusRequest = options.focus;
    this.warn = options.onWarning ?? ((message) => console.warn(`[rte] ${message}`));
    this.keymap = new Keymap(options.platform ?? detectPlatform(), this.warn);
    this.commands = new CommandRegistry(this);
    this.current = this.makeSnapshot();
    this.notified = this.current;
  }

  // ---- state ----------------------------------------------------------------------------------------------

  /** The current state. A new object after every change, the same object until then. */
  get snapshot(): EditorSnapshot {
    return this.current;
  }
  get document(): Doc { return this.doc; }
  get selection(): Selection { return this.sel; }
  get readOnly(): boolean { return this.readOnlyMode; }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /** The marks chosen for the next typed text, while the caret is still where they were chosen. */
  get storedMarks(): readonly Mark[] | undefined { return this.current.storedMarks; }

  private makeSnapshot(): EditorSnapshot {
    // Marks chosen at a caret are good only for that caret: once it moves, or a range is selected, they are forgotten.
    const at = this.stored;
    let storedMarks: readonly Mark[] | undefined;
    if (at && isCollapsed(this.sel) && this.sel.focus.offset === at.offset && pathKey(this.sel.focus.path) === pathKey(at.path)) storedMarks = at.marks;
    else this.stored = undefined;
    return {
      version: this.version, doc: this.doc, selection: this.sel, readOnly: this.readOnlyMode, focused: this.focusedState,
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0, storedMarks,
    };
  }

  private commit(change: Change): void {
    const previous = this.current;
    this.version++;
    this.current = this.makeSnapshot();
    // The host redraws at once, so the page is never behind the model...
    for (const hook of [...this.hooks]) hook(this.current, previous, change);
    // ...while everyone else is told once per turn of the event loop, however many changes happened.
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => this.flush());
    }
  }

  private flush(): void {
    this.scheduled = false;
    const snapshot = this.current;
    const previous = this.notified;
    if (snapshot === previous) return;
    this.notified = snapshot;
    for (const listener of [...this.listeners]) listener(snapshot, previous);
    for (const sub of [...this.selectors]) {
      const value = sub.select(snapshot);
      if (!sub.equals(value, sub.last)) {
        sub.last = value;
        sub.onChange(value as never);
      }
    }
    this.commands.flush();
  }

  // ---- changes --------------------------------------------------------------------------------------------

  /** Called before a command or edit reads the selection, so a host can bring it up to date. */
  refresh(): void {
    this.beforeAccess?.();
  }

  requestFocus(): void {
    this.focusRequest?.();
  }

  /**
   * Runs one edit against the current document and selection as a single history step. Neighbouring edits of the same
   * `kind` ("type", "delete") share one step. False when nothing changed, or when the editor is read-only.
   */
  apply(kind: string, op: (doc: Doc, sel: Selection) => EditResult): boolean {
    if (this.readOnlyMode) return false;
    this.refresh();
    const before: Level = { doc: this.doc, selection: this.sel };
    const result = op(this.doc, this.sel);
    if (result.doc === this.doc && sameSelection(result.selection, this.sel)) return false;
    const docChanged = result.doc !== this.doc;
    if (docChanged) {
      const groups = kind === "type" || kind === "delete";
      if (!(groups && this.lastKind === kind)) {
        this.undoStack.push(before);
        if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
      }
      this.lastKind = kind;
      this.redoStack = [];
    }
    this.doc = result.doc;
    this.sel = result.selection;
    this.commit({ docChanged, selectionChanged: !sameSelection(before.selection, this.sel) });
    return true;
  }

  /** Sets the selection without making a history step. Nothing happens if it is the selection already. */
  setSelection(selection: Selection): void {
    if (sameSelection(selection, this.sel)) return;
    this.sel = selection;
    this.commit({ docChanged: false, selectionChanged: true });
  }

  /** Chooses the marks for the text typed next at the caret. False when a range is selected or the editor is read-only. */
  setStoredMarks(marks: readonly Mark[]): boolean {
    if (this.readOnlyMode) return false;
    this.refresh();
    if (!isCollapsed(this.sel)) return false;
    this.stored = { path: this.sel.focus.path, offset: this.sel.focus.offset, marks };
    this.commit({ docChanged: false, selectionChanged: false });
    return true;
  }

  setFocused(focused: boolean): void {
    if (focused === this.focusedState) return;
    this.focusedState = focused;
    this.commit({ docChanged: false, selectionChanged: false });
  }

  setReadOnly(readOnly: boolean): void {
    if (readOnly === this.readOnlyMode) return;
    this.readOnlyMode = readOnly;
    this.commit({ docChanged: false, selectionChanged: false });
  }

  /** Replaces the whole document and empties the history. */
  setDocument(doc: Doc, selection?: Selection): void {
    this.doc = doc;
    this.sel = selection ?? caret(startOf(doc));
    this.undoStack = [];
    this.redoStack = [];
    this.lastKind = "";
    this.stored = undefined;
    this.commit({ docChanged: true, selectionChanged: true });
  }

  undo(): boolean {
    const level = this.undoStack.pop();
    if (!level || this.readOnlyMode) {
      if (level) this.undoStack.push(level);
      return false;
    }
    this.redoStack.push({ doc: this.doc, selection: this.sel });
    return this.restore(level);
  }

  redo(): boolean {
    const level = this.redoStack.pop();
    if (!level || this.readOnlyMode) {
      if (level) this.redoStack.push(level);
      return false;
    }
    this.undoStack.push({ doc: this.doc, selection: this.sel });
    return this.restore(level);
  }

  private restore(level: Level): boolean {
    const docChanged = level.doc !== this.doc;
    this.doc = level.doc;
    this.sel = level.selection;
    this.lastKind = "";
    this.stored = undefined;
    this.commit({ docChanged, selectionChanged: true });
    return true;
  }

  // ---- subscriptions --------------------------------------------------------------------------------------

  /** Calls back once per turn of the event loop in which anything changed. */
  subscribe(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Calls back when a selected part of the state changes, not on every change. */
  select<T>(selector: (snapshot: EditorSnapshot) => T, onChange: (value: T) => void, equals: (a: T, b: T) => boolean = Object.is): Unsubscribe {
    const sub = { select: selector, equals: equals as (a: unknown, b: unknown) => boolean, last: selector(this.current) as unknown, onChange: onChange as (v: never) => void };
    this.selectors.add(sub);
    return () => this.selectors.delete(sub);
  }

  /** For the host that draws the page: called at once, inside the change, with what changed. */
  onTransaction(hook: (snapshot: EditorSnapshot, previous: EditorSnapshot, change: Change) => void): Unsubscribe {
    this.hooks.add(hook);
    return () => this.hooks.delete(hook);
  }

  // ---- keys and plugins -----------------------------------------------------------------------------------

  /** Runs the command bound to a key event. True when a command ran and changed something, so the event should be stopped. */
  handleKey(event: KeyEventLike): boolean {
    for (const binding of this.keymap.findAll(event)) if (this.commands.run(binding.command, binding.arg)) return true;
    return false;
  }

  /**
   * Gives the text typed next to the caret to the plugins that watch for it (a list shortcut, say). Returns the result of the
   * first one that takes over, or undefined when none does and the text should be inserted as usual.
   */
  triggerText(typed: string): EditResult | undefined {
    this.refresh();
    for (const trigger of this.textTriggers) {
      const result = trigger(this.doc, this.sel, typed);
      if (result) return result;
    }
    return undefined;
  }

  /** Adds a plugin. Returns a function that takes everything it added away again. */
  use(plugin: Plugin): Unsubscribe {
    if (this.plugins.has(plugin.id)) throw new Error(`The plugin ${plugin.id} is already registered.`);
    if (!satisfiesApi(plugin.api, PLUGIN_API_VERSION)) {
      throw new Error(`The plugin ${plugin.id} needs plugin API ${plugin.api}; this editor has ${PLUGIN_API_VERSION}.`);
    }
    const undo: (() => void)[] = [];
    const host: PluginHost = {
      editor: this,
      ops,
      command: (def: CommandDef<never, unknown>) => { undo.push(this.commands.register(def)); },
      keybinding: (binding: KeyBinding) => {
        this.keymap.add(binding, plugin.id);
        undo.push(() => this.keymap.remove(binding.command));
      },
      behavior: (kind: ContainerKind, behavior: ContainerBehavior) => {
        if (this.behaviors[kind]) throw new Error(`The container ${kind} already has a behavior; ${plugin.id} cannot add another.`);
        this.behaviors[kind] = behavior;
        undo.push(() => { delete this.behaviors[kind]; });
      },
      textTrigger: (trigger: TextTrigger) => {
        this.textTriggers.push(trigger);
        undo.push(() => { const i = this.textTriggers.indexOf(trigger); if (i !== -1) this.textTriggers.splice(i, 1); });
      },
      importOptions: (options) => {
        if (options.sanitizeSvg) {
          if (this.importOptions.sanitizeSvg) throw new Error(`${plugin.id} cannot set an SVG cleaner: one is already set.`);
          this.importOptions.sanitizeSvg = options.sanitizeSvg;
        }
        const added = options.recognizers ?? [];
        this.importOptions.recognizers = [...this.importOptions.recognizers, ...added];
        // Taking the plugin away takes away what it added and nothing else.
        undo.push(() => {
          if (options.sanitizeSvg && this.importOptions.sanitizeSvg === options.sanitizeSvg) delete this.importOptions.sanitizeSvg;
          this.importOptions.recognizers = this.importOptions.recognizers.filter((r) => !added.includes(r));
        });
      },
      pasteTransform: (transform: PasteTransform) => {
        this.pasteTransforms.push(transform);
        undo.push(() => { const i = this.pasteTransforms.indexOf(transform); if (i !== -1) this.pasteTransforms.splice(i, 1); });
      },
      ui: (slot, item) => { undo.push(this.ui.add(slot, item)); },
      fileHandler: (handler: FileHandler) => {
        this.fileHandlers.push(handler);
        undo.push(() => { const i = this.fileHandlers.indexOf(handler); if (i !== -1) this.fileHandlers.splice(i, 1); });
      },
      pasteHandler: (handler: PasteHandler) => {
        this.pasteHandlers.push(handler);
        undo.push(() => { const i = this.pasteHandlers.indexOf(handler); if (i !== -1) this.pasteHandlers.splice(i, 1); });
      },
    };
    const teardown = plugin.setup(host);
    if (teardown) undo.push(teardown);
    const remove = (): void => {
      for (const fn of undo.reverse()) fn();
      this.plugins.delete(plugin.id);
    };
    this.plugins.set(plugin.id, remove);
    return remove;
  }
}
