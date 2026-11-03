import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultIcons } from "./defaults.ts";

test("every icon is a 24 by 24 svg drawn in the current color, hidden from assistive technology, with no script or size", () => {
  const names = Object.keys(defaultIcons);
  assert.ok(names.length >= 20);
  for (const [name, svg] of Object.entries(defaultIcons)) {
    assert.match(svg, /^<svg [^>]*viewBox="0 0 24 24"/, name);
    assert.match(svg, /stroke="currentColor"/, name);
    assert.match(svg, /aria-hidden="true"/, name);
    assert.ok(!/<script|\son\w+=|\shref=|\swidth=|\sheight=|\sstyle=/.test(svg), `${name} has something it should not`);
    assert.ok((svg.match(/<svg/g) ?? []).length === 1 && svg.endsWith("</svg>"), name);
  }
});

test("there is an icon for every name the editor's own interface items use", async () => {
  // Names are written in the core's item list; keep this list in step with it.
  const used = ["undo", "redo", "bold", "italic", "underline", "strikethrough", "code", "superscript", "subscript", "align-left", "align-center", "align-right", "align-justify", "link", "unlink", "list-bulleted", "list-numbered", "list-definition", "outdent", "indent", "table", "quote", "code-block", "rule", "clear-format", "text-color", "highlight", "image", "image-properties", "search", "source", "direction-ltr", "direction-rtl", "symbols", "keyboard", "cell-style", "checklist", "footnote"];
  for (const name of used) assert.ok(name in defaultIcons, name);
});
