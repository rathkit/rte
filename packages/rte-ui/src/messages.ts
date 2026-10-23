import type { MessageKey } from "./types.ts";

export const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  "toolbar.label": "Formatting",
  "dialog.ok": "OK",
  "dialog.cancel": "Cancel",
  "field.required": "{label} is required.",
  "field.url": "{label} must be a web, mail or phone address.",
  "toggle.on": "{label} on",
  "toggle.off": "{label} off",
  "status.word": "{count} word",
  "status.words": "{count} words",
  "status.characters": "{count} characters",
  "status.selection": "{selected} of {total} words",
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
  "find.total": "{total} matches",
};

export function text(table: Partial<Record<MessageKey, string>> | undefined, key: MessageKey, fallback = "", values: Record<string, string> = {}): string {
  const raw = table?.[key] ?? DEFAULT_MESSAGES[key] ?? fallback;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}
