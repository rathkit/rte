import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { THEMES, TOKENS } from "./tokens.ts";

const css = (name: string): string => readFileSync(new URL(`../css/${name}.css`, import.meta.url), "utf8");

/** Reads the declarations inside the first block whose selector contains `selector`. Good enough for token files, which have no nesting. */
function declarations(text: string, selector: string, afterMedia = false): Map<string, string> {
  const source = afterMedia ? text.slice(text.indexOf("@media")) : text.replace(/@media[\s\S]*$/, text);
  const start = source.indexOf(selector);
  assert.ok(start !== -1, `no block for ${selector}`);
  const body = source.slice(source.indexOf("{", start) + 1, source.indexOf("}", start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)) out.set(m[1] as string, (m[2] as string).trim());
  return out;
}

const channel = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel(((n >> 16) & 255) / 255) + 0.7152 * channel(((n >> 8) & 255) / 255) + 0.0722 * channel((n & 255) / 255);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const sets: Record<string, Map<string, string>> = {
  light: declarations(css("light"), '[data-rk-theme="light"]'),
  dark: declarations(css("dark"), '[data-rk-theme="dark"]'),
  "auto (light)": declarations(css("auto"), '[data-rk-theme="auto"]'),
  "auto (dark)": new Map([...declarations(css("auto"), '[data-rk-theme="auto"]'), ...declarations(css("auto"), '[data-rk-theme="auto"]:not([data-rk-scheme="light"])', true)]),
  "auto (forced dark)": new Map([...declarations(css("auto"), '[data-rk-theme="auto"]'), ...declarations(css("auto"), '[data-rk-scheme="dark"]')]),
  "high-contrast": declarations(css("high-contrast"), '[data-rk-theme="high-contrast"]'),
};

test("there are at most 50 tokens", () => assert.ok(TOKENS.length <= 50, String(TOKENS.length)));

test("every theme sets every token, and nothing that is not a token", () => {
  for (const [name, set] of Object.entries(sets)) {
    const tokens = [...set.keys()].filter((k) => k.startsWith("--"));
    assert.deepEqual(TOKENS.filter((t) => !set.has(t)), [], `${name} is missing tokens`);
    assert.deepEqual(tokens.filter((t) => !(TOKENS as readonly string[]).includes(t)), [], `${name} sets unknown tokens`);
  }
});

test("each theme file is small, and scoped to a theme, never :root", () => {
  for (const name of [...THEMES, "density"]) {
    const text = css(name);
    assert.ok(text.length < 4096, `${name}.css is ${text.length} bytes`);
    assert.ok(!/(^|[\s,}])(:root|html|body)\b/.test(text.replace(/\/\*[\s\S]*?\*\//g, "")), `${name}.css reaches outside the editor`);
  }
});

// WCAG 2.2: 4.5:1 for text, 3:1 for the edges of controls and the focus ring.
const TEXT: [string, string][] = [
  ["--rk-fg", "--rk-bg"], ["--rk-fg", "--rk-surface"], ["--rk-fg", "--rk-surface-raised"], ["--rk-fg-muted", "--rk-bg"], ["--rk-fg-muted", "--rk-surface"],
  ["--rk-accent-fg", "--rk-accent"], ["--rk-accent", "--rk-bg"], ["--rk-accent", "--rk-surface-raised"], ["--rk-accent", "--rk-accent-subtle"], ["--rk-fg", "--rk-accent-subtle"],
  ["--rk-brand-text", "--rk-bg"], ["--rk-danger", "--rk-bg"], ["--rk-danger", "--rk-surface-raised"], ["--rk-fg", "--rk-selection-bg"],
  ["--rk-fg", "--rk-control-hover"], ["--rk-fg", "--rk-control-active"], ["--rk-fg-muted", "--rk-control-hover"],
];
const EDGES: [string, string][] = [["--rk-border", "--rk-bg"], ["--rk-border", "--rk-surface"], ["--rk-focus-color", "--rk-bg"], ["--rk-focus-color", "--rk-surface"], ["--rk-focus-color", "--rk-surface-raised"], ["--rk-accent", "--rk-surface"]];

test("text keeps 4.5:1 against its background in every theme", () => {
  for (const [name, set] of Object.entries(sets)) {
    for (const [fg, bg] of TEXT) {
      const ratio = contrast(set.get(fg) as string, set.get(bg) as string);
      assert.ok(ratio >= 4.5, `${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("control edges and the focus ring keep 3:1 in every theme", () => {
  for (const [name, set] of Object.entries(sets)) {
    for (const [fg, bg] of EDGES) {
      const ratio = contrast(set.get(fg) as string, set.get(bg) as string);
      assert.ok(ratio >= 3, `${name}: ${fg} against ${bg} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test("a control is at least 24 CSS pixels (WCAG 2.2 target size), in every density", () => {
  const sizes = [...css("light").matchAll(/--rk-control-size:\s*(\d+)px/g), ...css("density").matchAll(/--rk-control-size:\s*(\d+)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length >= 3);
  for (const size of sizes) assert.ok(size >= 24, String(size));
});
