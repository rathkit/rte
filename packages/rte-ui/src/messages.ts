import type { UiItem } from "@rathkit/rte-core";
import type { HeadlessEditor } from "@rathkit/rte-headless";
import type { Message, MessageKey, PluralMessage } from "./types.ts";

export const DEFAULT_MESSAGES: Readonly<Record<string, Message>> = {
  "toolbar.label": "Formatting",
  "floating.label": "Selection formatting",
  "context.label": "Editing commands",
  "dialog.ok": "OK",
  "dialog.cancel": "Cancel",
  "field.required": "{label} is required.",
  "field.url": "{label} must be a web, mail or phone address.",
  "toggle.on": "{label} on",
  "toggle.off": "{label} off",
  "status.words": { one: "{count} word", other: "{count} words" },
  "status.characters": { one: "{count} character", other: "{count} characters" },
  "status.selection": { one: "{selected} of {total} word", other: "{selected} of {total} words" },
  "source.label": "HTML source",
  "shortcuts.title": "Keyboard shortcuts",
  "shortcuts.action": "Action",
  "shortcuts.keys": "Keys",
  "shortcuts.close": "Close",
  "shortcuts.leave": "Leave the writing area",
  "shortcuts.leaveKeys": "Escape, then Tab",
  "find.find": "Find",
  "find.replaceWith": "Replace with",
  "find.previous": "Previous match",
  "find.next": "Next match",
  "find.close": "Close find and replace",
  "find.matchCase": "Match case",
  "find.wholeWord": "Whole word",
  "find.replace": "Replace",
  "find.replaceAll": "Replace all",
  "find.none": "No matches",
  "find.count": "{current} of {total}",
  "find.total": { one: "{total} match", other: "{total} matches" },
};

/** The items the styled interface adds to the toolbar itself, with their words. */
export const UI_ITEMS = { source: "HTML source", shortcuts: "Keyboard shortcuts" } as const;

/**
 * The stable id of every word that comes from an interface item or a command. One place builds them, so what the interface looks up and
 * what the completeness tool checks a pack against are the same.
 */
export const keyOf = {
  item: (id: string): MessageKey => `item.${id}`,
  /** A choice of a select item: `item.block=1`. */
  option: (id: string, value: unknown): MessageKey => `item.${id}=${String(value)}`,
  /** A field of a dialog item: `item.link.href`. */
  field: (id: string, name: string): MessageKey => `item.${id}.${name}`,
  /** A choice of a dialog's field: `item.image-properties.align=left`. */
  choice: (id: string, name: string, value: string): MessageKey => `item.${id}.${name}=${value}`,
  /** A command, as the keyboard shortcuts list names it: `command.format.bold`. */
  command: (name: string): MessageKey => `command.${name}`,
};

const plurals = new Map<string, Intl.PluralRules>();
const numbers = new Map<string, Intl.NumberFormat>();

/** The form of a plural message for a number, by the language's own rules (the platform's `Intl.PluralRules`); `other` when it has no such form. */
function pick(message: PluralMessage, count: number, locale: string): string {
  let rules = plurals.get(locale);
  if (!rules) plurals.set(locale, (rules = new Intl.PluralRules(locale)));
  return message[rules.select(count)] ?? message.other;
}

/**
 * The words for a key: the table's, else the English default, else the fallback. `{name}` is replaced by the value of that name; a plural
 * message picks its form by the number given as `count`. Numbers are written the language's way when a locale is given, and as digits
 * with nothing between them when it is not (the English default, unchanged).
 */
export function text(table: Partial<Record<MessageKey, Message>> | undefined, key: MessageKey, fallback = "", values: Record<string, string | number> = {}, locale?: string): string {
  const given = table?.[key] ?? DEFAULT_MESSAGES[key] ?? fallback;
  const raw = typeof given === "string" ? given : pick(given, Number(values.count ?? 0), locale ?? "en");
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    if (typeof value !== "number") return value ?? "";
    if (!locale) return String(value);
    let format = numbers.get(locale);
    if (!format) numbers.set(locale, (format = new Intl.NumberFormat(locale)));
    return format.format(value);
  });
}

/** The editor parts the catalog reads: its items, its commands and its keys. */
export type CatalogEditor = Pick<HeadlessEditor, "ui" | "commands" | "keymap">;

/**
 * Every word the styled interface can say for this editor, in English, by stable id: its own words, a key for each interface item in
 * every slot (and each choice in a select, each field and choice in a dialog), and each command that has a key, as the keyboard shortcuts
 * list names it. This is what a message pack is checked against, and a starting point for writing one. Items added later by a plugin are
 * not in it, so make the catalog from an editor that has all the plugins in use.
 */
export function messageCatalog(editor: CatalogEditor): Record<string, Message> {
  const out: Record<string, Message> = { ...DEFAULT_MESSAGES };
  const labels = new Map(editor.commands.list().map((c) => [c.name, c.label]));
  for (const [id, label] of Object.entries(UI_ITEMS)) out[keyOf.item(id)] = label;
  const add = (item: UiItem): void => {
    if (item.kind === "separator") return;
    const command = "command" in item ? item.command : undefined;
    out[keyOf.item(item.id)] = ("label" in item && item.label) || (command && labels.get(command)) || item.id;
    if (item.kind === "menu") item.items.forEach(add);
    if (item.kind === "select") for (const o of item.options) out[keyOf.option(item.id, o.value)] = o.label;
    if (item.kind === "dialog") {
      for (const f of item.fields) {
        out[keyOf.field(item.id, f.name)] = f.label;
        for (const c of f.choices ?? []) out[keyOf.choice(item.id, f.name, c.value)] = c.label;
      }
    }
  };
  for (const slot of editor.ui.slotNames()) editor.ui.items(slot).forEach(add);
  for (const binding of editor.keymap.list()) {
    if (editor.keymap.shortcutFor(binding.command)) out[keyOf.command(binding.command)] = labels.get(binding.command) ?? binding.command;
  }
  return out;
}
