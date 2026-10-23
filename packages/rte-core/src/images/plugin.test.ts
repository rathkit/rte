import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeBase64 } from "../base64.ts";
import { createEngine } from "../core.ts";
import { exportHtml } from "../export.ts";
import { importBlocks } from "../import.ts";
import type { FileLike } from "../plugin.ts";
import { svg } from "../svg/plugin.ts";
import { images, type ImagesOptions } from "./plugin.ts";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const bytesOf = (n: number, head: readonly number[] = PNG): Uint8Array => { const a = new Uint8Array(n); a.set(head); return a; };
const dataUrl = (bytes: Uint8Array, type = "image/png"): string => `data:${type};base64,${encodeBase64(bytes)}`;

class FakeFile implements FileLike {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  private readonly bytes: Uint8Array;
  constructor(name: string, type: string, bytes: Uint8Array) {
    this.name = name;
    this.type = type;
    this.bytes = bytes;
    this.size = bytes.length;
  }
  slice(start = 0, end = this.size): FileLike { return new FakeFile(this.name, this.type, this.bytes.slice(start, end)); }
  async arrayBuffer(): Promise<ArrayBuffer> { return this.bytes.slice().buffer as ArrayBuffer; }
  async text(): Promise<string> { return new TextDecoder().decode(this.bytes); }
}

const setup = (options: ImagesOptions = {}, withSvg = true) => {
  const engine = createEngine({ onWarning: () => undefined });
  if (withSvg) engine.use(svg());
  engine.use(images(options));
  return engine;
};
const settle = async (engine: ReturnType<typeof setup>, html: string): Promise<string> => {
  let blocks: readonly import("../model.ts").Block[] = importBlocks(html);
  for (const transform of engine.pasteTransforms) blocks = await transform(blocks);
  return exportHtml({ blocks });
};
const filesToHtml = async (engine: ReturnType<typeof setup>, files: FileLike[]): Promise<string | undefined> => {
  const blocks = await engine.fileHandlers[0]?.(files);
  return blocks ? exportHtml({ blocks }) : undefined;
};

test("pasted data images: small ones stay, large ones are left out and reported", async () => {
  const rejected: unknown[] = [];
  const e = setup({ maxInlineImageBytes: 100, onImageRejected: (i) => rejected.push(i) });
  const html = `<p>a</p><p><img src="${dataUrl(bytesOf(50))}"></p><p><img src="${dataUrl(bytesOf(500))}"></p>`;
  const out = await settle(e, html);
  assert.equal((out.match(/<img/g) ?? []).length, 1);
  assert.deepEqual(rejected, [{ reason: "too-large", type: "image/png", size: 500 }]);
});

test("with an upload function, pasted data images and files become addresses, side by side, and failures are reported", async () => {
  const rejected: { reason: string }[] = [];
  let running = 0;
  let most = 0;
  let calls = 0;
  const e = setup({
    uploadImage: async (file) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      calls++;
      if (file.size === 8) throw new Error("server down");
      return `https://cdn.test/${calls}.png`;
    },
    onImageRejected: (i) => rejected.push(i),
  });
  const out = await settle(e, `<p><img src="${dataUrl(bytesOf(300))}"></p><p><img src="${dataUrl(bytesOf(400))}"></p>`);
  assert.equal((out.match(/https:\/\/cdn\.test\//g) ?? []).length, 2);
  assert.ok(!out.includes("data:"));
  assert.ok(most > 1, "uploads ran one after another");
  const file = await filesToHtml(e, [new FakeFile("p.png", "image/png", bytesOf(900))]);
  assert.match(file ?? "", /<img src="https:\/\/cdn\.test\/\d\.png">/);
  const failed = await filesToHtml(e, [new FakeFile("p.png", "image/png", bytesOf(8))]);
  assert.equal(failed, undefined);
  assert.equal(rejected.at(-1)?.reason, "upload-failed");
});

test("files: the bytes must match the type, big files are refused, and other files are ignored", async () => {
  const rejected: { reason: string }[] = [];
  const e = setup({ maxInlineImageBytes: 1000, maxImageFileBytes: 5000, onImageRejected: (i) => rejected.push(i) });
  assert.match((await filesToHtml(e, [new FakeFile("a.png", "image/png", bytesOf(200))])) ?? "", /<img src="data:image\/png;base64,/);
  assert.equal(await filesToHtml(e, [new FakeFile("fake.png", "image/png", new TextEncoder().encode("<script>alert(1)</script>"))]), undefined);
  assert.equal(await filesToHtml(e, [new FakeFile("big.png", "image/png", bytesOf(2000))]), undefined);
  assert.equal(await filesToHtml(e, [new FakeFile("huge.png", "image/png", bytesOf(6000))]), undefined);
  assert.equal(await filesToHtml(e, [new FakeFile("note.txt", "text/plain", new TextEncoder().encode("hi"))]), undefined);
  assert.deepEqual(rejected.map((r) => r.reason), ["unsupported", "too-large", "too-large"]);
});

test("svg files are cleaned when the svg plugin is there, and refused when it is not", async () => {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script><rect width="4" height="4" onclick="x()"/></svg>';
  const file = new FakeFile("a.svg", "image/svg+xml", new TextEncoder().encode(source));
  const withSvg = await filesToHtml(setup({}, true), [file]);
  const decoded = Buffer.from(/base64,([^"]+)"/.exec(withSvg ?? "")?.[1] ?? "", "base64").toString();
  assert.ok(decoded.includes("<rect") && !/script|onclick/.test(decoded), decoded);
  const rejected: { reason: string }[] = [];
  const without = await filesToHtml(setup({ onImageRejected: (i) => rejected.push(i) }, false), [file]);
  assert.equal(without, undefined);
  assert.deepEqual(rejected.map((r) => r.reason), ["unsupported"]);
});

test("removing the plugin takes its hooks away", () => {
  const e = createEngine({ onWarning: () => undefined });
  const remove = e.use(images());
  assert.equal(e.pasteTransforms.length + e.fileHandlers.length, 2);
  remove();
  assert.equal(e.pasteTransforms.length + e.fileHandlers.length, 0);
});

test("image.insert puts an image at the caret, replaces a selection, takes a description, and refuses what the paste check refuses", async () => {
  const { importHtml } = await import("../import.ts");
  const { caret } = await import("../path.ts");
  const engine = setup();
  engine.setDocument(importHtml("<p>one two</p>"));
  engine.setSelection(caret({ path: [0], offset: 3 }));
  assert.equal(engine.commands.run("image.insert", { src: "https://example.test/a.png", alt: "  A cat " }), true);
  assert.equal(exportHtml(engine.document), '<p>one<img src="https://example.test/a.png" alt="A cat"> two</p>');
  assert.deepEqual(engine.selection.focus, { path: [0], offset: 4 }, "the caret is after the image");
  engine.setSelection({ anchor: { path: [0], offset: 5 }, focus: { path: [0], offset: 8 } });
  engine.commands.run("image.insert", { src: "https://example.test/b.png" });
  assert.equal(exportHtml(engine.document), '<p>one<img src="https://example.test/a.png" alt="A cat"> <img src="https://example.test/b.png"></p>');
  for (const bad of ["javascript:alert(1)", "", "data:text/html;base64,PHA+", "  "]) {
    assert.equal(engine.commands.run("image.insert", { src: bad }), false, bad);
  }
  assert.equal(engine.commands.run("image.insert", {}), false);
  engine.undo();
  assert.match(exportHtml(engine.document), /a\.png.* two/);
});

test("image.insert is off in a code block", async () => {
  const { importHtml } = await import("../import.ts");
  const { caret } = await import("../path.ts");
  const engine = setup();
  engine.setDocument(importHtml("<pre>code</pre>"));
  engine.setSelection(caret({ path: [0], offset: 2 }));
  assert.equal(engine.commands.state("image.insert").enabled, false);
  assert.equal(engine.commands.run("image.insert", { src: "https://example.test/a.png" }), false);
});
