// Interface items as data. A plugin or the editor says "there is a button for this command in this place"; a user interface
// (the styled one, a custom one, or none) reads the items and draws them however it likes. Items never hold markup, CSS or
// state: whether a button is pressed or disabled always comes from the command it points at. EXPERIMENTAL.
import type { Unsubscribe } from "./commands.ts";

/** The name of an icon. What it looks like is up to whoever draws it. */
export type IconName = string;


export interface Field {
  readonly name: string;
  readonly type: "text" | "url" | "number" | "color" | "choice" | "checkbox";
  readonly label: string;
  readonly required?: boolean;
  readonly choices?: readonly { readonly value: string; readonly label: string }[];
}

interface Placement {
  readonly id: string;
  /** Items in the same group sit together; groups keep the order they first appear in. */
  readonly group?: string;
  /** Lower first, within the group. */
  readonly order?: number;
}

export type UiItem =
  | (Placement & { readonly kind: "button"; readonly command: string; readonly arg?: unknown; readonly icon?: IconName; readonly label?: string; readonly swatch?: string })
  /** Like a button, but it shows whether the command is active (`aria-pressed`). */
  | (Placement & { readonly kind: "toggle"; readonly command: string; readonly arg?: unknown; readonly icon?: IconName; readonly label?: string; readonly swatch?: string })
  | (Placement & { readonly kind: "menu"; readonly label: string; readonly icon?: IconName; readonly items: readonly UiItem[] })
  /** Choose one of several values; each runs the command with its value as the argument. */
  | (Placement & { readonly kind: "select"; readonly command: string; readonly label: string; readonly options: readonly { readonly value: unknown; readonly label: string }[] })
  /** Opens a dialog that collects fields and then runs the command with them as the argument. */
  | (Placement & { readonly kind: "dialog"; readonly command: string; readonly label: string; readonly icon?: IconName; readonly fields: readonly Field[] })
  /** A place for a plugin's own interface; each user interface supplies a renderer for the panel name. */
  | (Placement & { readonly kind: "panel"; readonly name: string; readonly label: string; readonly icon?: IconName })
  | (Placement & { readonly kind: "separator" });

export type UiSlot = string;

/** The places items can go. Others may be used; these are the ones the editor itself reads. */
export const SLOTS = { toolbar: "toolbar.main", floating: "toolbar.floating", context: "menu.context", slash: "menu.slash", status: "statusbar" } as const;

export class UiRegistry {
  private readonly slots = new Map<UiSlot, { items: UiItem[]; sorted: readonly UiItem[] }>();
  private readonly listeners = new Map<UiSlot, Set<() => void>>();

  /** Adds an item to a slot. Returns a function that removes it. An id must be unique within its slot. */
  add(slot: UiSlot, item: UiItem): Unsubscribe {
    const entry = this.slots.get(slot) ?? { items: [], sorted: [] };
    if (entry.items.some((i) => i.id === item.id)) throw new Error(`The slot ${slot} already has an item ${item.id}.`);
    entry.items.push(item);
    this.slots.set(slot, entry);
    this.changed(slot);
    return () => {
      const at = entry.items.indexOf(item);
      if (at === -1) return;
      entry.items.splice(at, 1);
      this.changed(slot);
    };
  }

  /** The items of a slot in display order: by group (in order of first appearance), then by `order`, then as added. */
  items(slot: UiSlot): readonly UiItem[] {
    return this.slots.get(slot)?.sorted ?? [];
  }

  slotNames(): readonly UiSlot[] {
    return [...this.slots.keys()];
  }

  /** Calls back when the items of a slot change. */
  subscribe(slot: UiSlot, callback: () => void): Unsubscribe {
    const set = this.listeners.get(slot) ?? new Set();
    set.add(callback);
    this.listeners.set(slot, set);
    return () => set.delete(callback);
  }

  private changed(slot: UiSlot): void {
    const entry = this.slots.get(slot) as { items: UiItem[]; sorted: readonly UiItem[] };
    const groups: string[] = [];
    for (const item of entry.items) if (!groups.includes(item.group ?? "")) groups.push(item.group ?? "");
    entry.sorted = entry.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => groups.indexOf(a.item.group ?? "") - groups.indexOf(b.item.group ?? "") || (a.item.order ?? 0) - (b.item.order ?? 0) || a.index - b.index)
      .map((x) => x.item);
    for (const callback of [...(this.listeners.get(slot) ?? [])]) callback();
  }
}
