import assert from "node:assert/strict";
import { test } from "node:test";
import { install } from "./index.ts";

// A stand-in page: enough of the DOM to see what the plugin builds and wires, without a browser (the browser checks run the real thing).
class FakeEl {
  attrs = new Map<string, string>(); children: FakeEl[] = []; listeners = new Map<string, (e: unknown) => void>();
  value = ""; options: unknown; removed = false;
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  addEventListener(k: string, f: (e: unknown) => void) { this.listeners.set(k, f); }
  appendChild(c: FakeEl) { this.children.push(c); }
  remove() { this.removed = true; }
  dispatchEvent() { return true; }
  whenReady() { return Promise.resolve("editor"); }
}
(globalThis as Record<string, unknown>).document = { createElement: () => new FakeEl() };
const jq = { fn: {} as Record<string, (this: unknown, ...a: unknown[]) => unknown> };
install(jq as never);
const collection = (...els: FakeEl[]) => Object.assign(els, { each(fn: (this: FakeEl) => void) { els.forEach((e) => fn.call(e)); return this; } });

test("turns each element into an editor once, with its label, html and read-only state", () => {
  const host = new FakeEl();
  const c = collection(host);
  jq.fn.rkEditor!.call(c, { label: "Body", html: "<p>x</p>", readOnly: true, onWarning: undefined });
  jq.fn.rkEditor!.call(c, { label: "Body" });
  assert.equal(host.children.length, 1);
  const el = host.children[0]!;
  assert.deepEqual([el.attrs.get("label"), el.attrs.get("value"), el.attrs.has("readonly")], ["Body", "<p>x</p>", true]);
});

test("reads and replaces html, hands out the editor, and removes it", async () => {
  const host = new FakeEl();
  const c = collection(host);
  jq.fn.rkEditor!.call(c, { label: "Body" });
  const el = host.children[0]!;
  el.value = "<p>now</p>";
  assert.equal(jq.fn.rkEditor!.call(collection(el), "html"), "<p>now</p>");
  jq.fn.rkEditor!.call(collection(el), "html", "<p>new</p>");
  assert.equal(el.value, "<p>new</p>");
  assert.equal(await (jq.fn.rkEditor!.call(collection(el), "editor") as Promise<string>), "editor");
  jq.fn.rkEditor!.call(c, "destroy");
  assert.equal(el.removed, true);
  assert.throws(() => jq.fn.rkEditor!.call(c, "nope"), /unknown method/);
});
