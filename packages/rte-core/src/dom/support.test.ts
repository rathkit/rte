import assert from "node:assert/strict";
import { test } from "node:test";
import { missingFeatures } from "./support.ts";

// A stand-in for a page that has everything the editor needs.
function page(): Record<string, unknown> {
  class InputEvent { getTargetRanges() { return []; } }
  class Element { replaceChildren() {} }
  class MutationObserver {}
  return { getSelection: () => null, InputEvent, Element, MutationObserver, queueMicrotask, Array, Object };
}

test("a page with every feature lacks nothing", () => {
  assert.deepEqual(missingFeatures(page()), []);
});

test("each missing feature is named", () => {
  const noBeforeInput = page();
  noBeforeInput.InputEvent = class {};
  assert.deepEqual(missingFeatures(noBeforeInput), ["InputEvent.prototype.getTargetRanges (beforeinput)"]);

  const old = page();
  delete old.MutationObserver;
  delete old.getSelection;
  old.Element = class {};
  old.Array = { prototype: {} };
  old.Object = {};
  delete old.queueMicrotask;
  assert.deepEqual(missingFeatures(old), [
    "window.getSelection", "MutationObserver", "Element.prototype.replaceChildren", "queueMicrotask", "Array.prototype.at", "Object.hasOwn",
  ]);
});

test("in Node, with no DOM, the browser features are listed and nothing throws", () => {
  assert.deepEqual(missingFeatures(), [
    "window.getSelection", "InputEvent.prototype.getTargetRanges (beforeinput)", "MutationObserver", "Element.prototype.replaceChildren",
  ]);
});
