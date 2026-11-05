import assert from "node:assert/strict";
import { test } from "node:test";
import { growth, probeScript } from "./probe.mjs";

const base = { listeners: 13, observers: 1, timers: 0, elements: 9, styleSheets: 2 };

test("growth names each count that went up and nothing else", () => {
  assert.deepEqual(growth(base, base), []);
  assert.deepEqual(growth(base, { ...base, listeners: 14, timers: 2 }), ["listeners went from 13 to 14", "timers went from 0 to 2"]);
  assert.deepEqual(growth(base, { ...base, elements: 3 }), []);
});

test("the probe script is a self-contained function body that parses", () => {
  assert.doesNotThrow(() => new Function(probeScript));
  assert.match(probeScript, /window\.__probe/);
});
