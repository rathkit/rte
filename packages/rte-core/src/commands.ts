// Named commands, their state, and subscriptions to that state.
import type { Engine, EditorSnapshot } from "./engine.ts";
import type { EditResult } from "./path.ts";
import type { Doc, Mark } from "./model.ts";
import type { Selection } from "./path.ts";

export type Unsubscribe = () => void;

export interface CommandState<V = unknown> {
  readonly enabled: boolean;
  /** For example: bold at the caret, or the list type the caret is in. */
  readonly active: boolean;
  /** For example: the current heading level or link address. */
  readonly value?: V;
}

export interface CommandContext {
  readonly snapshot: EditorSnapshot;
  /** Runs one edit as a single history step. Returns false when nothing changed or the editor is read-only. */
  apply(kind: string, op: (doc: Doc, sel: Selection) => EditResult): boolean;
  /** Moves back or forward one history step. False when there is none. */
  undo(): boolean;
  redo(): boolean;
  /** Chooses the marks for the text typed next at the caret. False when a range is selected or the editor is read-only. */
  setStoredMarks(marks: readonly Mark[]): boolean;
  focus(): void;
}

export interface CommandDef<A = unknown, V = unknown> {
  /** Stable and namespaced: `format.bold`, `block.heading`, `history.undo`. Plugin commands start with the plugin id. */
  readonly name: string;
  /** A default label in English. Hosts translate it by name. */
  readonly label: string;
  /** Whether the command changes the document. Such commands are disabled in a read-only editor. Default true. */
  readonly mutates?: boolean;
  /** Runs the command. False means it does not apply here and nothing changed. */
  run(ctx: CommandContext, arg: A): boolean;
  /** The state the command reports. Must be pure and cheap. `enabled` and `active` default to true and false. */
  state?(snapshot: EditorSnapshot): { readonly enabled?: boolean; readonly active?: boolean; readonly value?: V };
}

const same = (a: CommandState, b: CommandState): boolean => a.enabled === b.enabled && a.active === b.active && Object.is(a.value, b.value);

export class CommandRegistry {
  private readonly defs = new Map<string, CommandDef<never, unknown>>();
  private readonly cache = new Map<string, { version: number; state: CommandState }>();
  private readonly subscribers = new Map<string, { callbacks: Set<(s: CommandState) => void>; last: CommandState | undefined }>();
  private readonly engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  register<A, V>(def: CommandDef<A, V>): Unsubscribe {
    if (this.defs.has(def.name)) throw new Error(`The command ${def.name} is already registered.`);
    this.defs.set(def.name, def as unknown as CommandDef<never, unknown>);
    return () => {
      this.defs.delete(def.name);
      this.cache.delete(def.name);
    };
  }

  has(name: string): boolean {
    return this.defs.has(name);
  }

  list(): readonly { readonly name: string; readonly label: string }[] {
    return [...this.defs.values()].map((d) => ({ name: d.name, label: d.label }));
  }

  /** The command's state for the current snapshot. The same object is returned until the state changes. */
  state(name: string): CommandState {
    const def = this.defs.get(name);
    const snap = this.engine.snapshot;
    if (!def) return { enabled: false, active: false };
    const hit = this.cache.get(name);
    if (hit && hit.version === snap.version) return hit.state;
    const raw = def.state?.(snap) ?? {};
    const locked = snap.readOnly && def.mutates !== false;
    const next: CommandState = {
      enabled: (raw.enabled ?? true) && !locked,
      active: raw.active ?? false,
      ...(raw.value !== undefined ? { value: raw.value } : {}),
    };
    const state = hit && same(hit.state, next) ? hit.state : next;
    this.cache.set(name, { version: snap.version, state });
    return state;
  }

  /** Runs a command if it exists and is enabled. True when it changed something. */
  run(name: string, arg?: unknown): boolean {
    const def = this.defs.get(name);
    if (!def) return false;
    this.engine.refresh();
    if (!this.state(name).enabled) return false;
    const engine = this.engine;
    const ctx: CommandContext = {
      get snapshot() { return engine.snapshot; },
      apply: (kind, op) => engine.apply(kind, op),
      setStoredMarks: (marks) => engine.setStoredMarks(marks),
      undo: () => engine.undo(),
      redo: () => engine.redo(),
      focus: () => engine.requestFocus(),
    };
    return (def as unknown as CommandDef<unknown, unknown>).run(ctx, arg);
  }

  /** Calls back when the command's state changes, not on every edit. */
  subscribe(name: string, callback: (state: CommandState) => void): Unsubscribe {
    let entry = this.subscribers.get(name);
    if (!entry) {
      entry = { callbacks: new Set(), last: this.state(name) };
      this.subscribers.set(name, entry);
    }
    entry.callbacks.add(callback);
    return () => {
      entry?.callbacks.delete(callback);
      if (entry && entry.callbacks.size === 0) this.subscribers.delete(name);
    };
  }

  /** Called by the engine after a change: recomputes only commands someone is watching. */
  flush(): void {
    for (const [name, entry] of this.subscribers) {
      const state = this.state(name);
      if (state !== entry.last) {
        entry.last = state;
        for (const callback of [...entry.callbacks]) callback(state);
      }
    }
  }
}
