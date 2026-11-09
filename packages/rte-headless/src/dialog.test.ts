import assert from "node:assert/strict";
import { test } from "node:test";
import type { Warning } from "@rathkit/rte-core";
import { createDialog } from "./dialog.ts";

/** Just enough of an element for the helper to start; there is no DOM in these tests. */
const element = (attributes: Record<string, string> = {}) => {
  const attrs = new Map(Object.entries(attributes));
  return {
    hasAttribute: (name: string) => attrs.has(name),
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as HTMLElement;
};

test("a dialog with no name is reported as a missing-label warning", () => {
  const seen: Warning[] = [];
  createDialog({ dialog: element(), onWarning: (w) => seen.push(w) });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.code, "missing-label");
  assert.match(seen[0]?.message ?? "", /needs a name/);
});

test("a dialog with aria-label or aria-labelledby reports nothing", () => {
  const seen: Warning[] = [];
  createDialog({ dialog: element({ "aria-label": "Link" }), onWarning: (w) => seen.push(w) });
  createDialog({ dialog: element({ "aria-labelledby": "t" }), onWarning: (w) => seen.push(w) });
  assert.deepEqual(seen, []);
});

test("with no handler the warning goes to the console in the editor's format", () => {
  const lines: string[] = [];
  const original = console.warn;
  console.warn = (line: string) => void lines.push(line);
  try { createDialog({ dialog: element() }); } finally { console.warn = original; }
  assert.deepEqual(lines, ["[rte] missing-label: A dialog needs a name: give it aria-labelledby or aria-label."]);
});

test("a handler that throws does not stop the dialog from being made", () => {
  const dialog = createDialog({ dialog: element(), onWarning: () => { throw new Error("handler"); } });
  assert.equal(dialog.isOpen, false);
});
