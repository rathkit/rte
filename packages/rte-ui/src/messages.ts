import type { MessageKey } from "./types.ts";

export const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  "toolbar.label": "Formatting",
  "dialog.ok": "OK",
  "dialog.cancel": "Cancel",
  "field.required": "{label} is required.",
  "field.url": "{label} must be a web, mail or phone address.",
  "toggle.on": "{label} on",
  "toggle.off": "{label} off",
};

export function text(table: Partial<Record<MessageKey, string>> | undefined, key: MessageKey, fallback = "", values: Record<string, string> = {}): string {
  const raw = table?.[key] ?? DEFAULT_MESSAGES[key] ?? fallback;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
}
