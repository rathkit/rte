// Key chords and the commands they run. DOM-free: it works on anything shaped like a keyboard event.

export interface KeyBinding {
  /** A chord such as `Mod-b`, `Mod-Shift-z`, `Tab` or `Shift-Tab`. `Mod` is Command on Apple platforms and Control elsewhere. */
  readonly key: string;
  readonly command: string;
  readonly arg?: unknown;
}

export interface KeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export type Platform = "apple" | "other";

const ALIASES: Record<string, string> = { control: "Ctrl", ctrl: "Ctrl", cmd: "Meta", command: "Meta", meta: "Meta", option: "Alt", alt: "Alt", shift: "Shift", minus: "-" };
const ORDER = ["Ctrl", "Alt", "Shift", "Meta"];

/**
 * The platform this code is running on, for hosts that do not say. The platform string is trusted over the user agent, which
 * some browsers fill with another system's name (a Linux build of WebKit says "Macintosh").
 */
export function detectPlatform(): Platform {
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string; userAgentData?: { platform?: string } } }).navigator;
  const platform = nav?.userAgentData?.platform || nav?.platform || "";
  return /Mac|iPhone|iPad|iPod|iOS/i.test(platform || nav?.userAgent || "") ? "apple" : "other";
}

export class Keymap {
  private bindings: KeyBinding[] = [];
  private readonly platform: Platform;
  private readonly warn: (message: string) => void;

  constructor(platform: Platform, warn: (message: string) => void) {
    this.platform = platform;
    this.warn = warn;
  }

  /** Turns a written chord into its canonical form: modifiers in a fixed order, `Mod` resolved, single letters lower case. */
  normalize(chord: string): string {
    const parts = chord.split(/-(?=.)/);
    const key = parts.pop() as string;
    const mods = new Set<string>();
    for (const part of parts) {
      const lower = part.toLowerCase();
      mods.add(lower === "mod" ? (this.platform === "apple" ? "Meta" : "Ctrl") : (ALIASES[lower] ?? part));
    }
    const name = ALIASES[key.toLowerCase()] === "-" ? "-" : key.length === 1 ? key.toLowerCase() : key;
    return [...ORDER.filter((m) => mods.has(m)), name].join("-");
  }

  /** The canonical chord an event makes. */
  chordOf(event: KeyEventLike): string {
    const mods = ORDER.filter((m) => (m === "Ctrl" && event.ctrlKey) || (m === "Alt" && event.altKey) || (m === "Shift" && event.shiftKey) || (m === "Meta" && event.metaKey));
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    // Shift on a letter shows in the key as a capital; the modifier already says it.
    return [...mods, key].join("-");
  }

  /** Adds a binding from the editor or a plugin. If the chord is taken, the first one keeps it and a warning says so. */
  add(binding: KeyBinding, source = "editor"): void {
    const chord = this.normalize(binding.key);
    const taken = this.bindings.find((b) => this.normalize(b.key) === chord);
    if (taken) {
      if (taken.command !== binding.command) this.warn(`Key ${binding.key} (from ${source}) is already bound to ${taken.command}; ${binding.command} was not bound.`);
      return;
    }
    this.bindings.push(binding);
  }

  /** The host's own choice: rebind a chord, or unbind it with `command: null`. This always wins. */
  override(binding: { readonly key: string; readonly command: string | null; readonly arg?: unknown }): void {
    const chord = this.normalize(binding.key);
    this.bindings = this.bindings.filter((b) => this.normalize(b.key) !== chord);
    if (binding.command !== null) this.bindings.push({ key: binding.key, command: binding.command, ...(binding.arg !== undefined ? { arg: binding.arg } : {}) });
  }

  remove(command: string): void {
    this.bindings = this.bindings.filter((b) => b.command !== command);
  }

  /** Every binding, so a UI can show shortcuts in tooltips and a help dialog. */
  list(): readonly KeyBinding[] {
    return this.bindings;
  }

  /** The first chord bound to a command, written for people: "Ctrl+B", "⌘B". */
  shortcutFor(command: string): string | undefined {
    const binding = this.bindings.find((b) => b.command === command);
    if (!binding) return undefined;
    const chord = this.normalize(binding.key).split("-");
    const key = chord.pop() as string;
    const names = this.platform === "apple" ? { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" } : { Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Meta: "Meta" };
    const mods = chord.map((m) => names[m as keyof typeof names]);
    const label = key.length === 1 ? key.toUpperCase() : key;
    return this.platform === "apple" ? `${mods.join("")}${label}` : [...mods, label].join("+");
  }

  /** The first chord bound to a command, written for `aria-keyshortcuts`: "Control+B", "Meta+Shift+Z". */
  ariaShortcut(command: string): string | undefined {
    const binding = this.bindings.find((b) => b.command === command);
    if (!binding) return undefined;
    const parts = this.normalize(binding.key).split("-");
    const key = parts.pop() as string;
    const label = key.length === 1 ? key.toUpperCase() : key;
    const order = ["Meta", "Control", "Alt", "Shift"];
    const mods = parts.map((m) => (m === "Ctrl" ? "Control" : m)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return [...mods, label].join("+");
  }

  find(event: KeyEventLike): KeyBinding | undefined {
    const chord = this.chordOf(event);
    return this.bindings.find((b) => this.normalize(b.key) === chord);
  }
}
