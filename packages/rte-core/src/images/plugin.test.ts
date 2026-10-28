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

test("image.update sets the description and size of the selected image; a width alone drops the old height; bad sizes are refused", async () => {
  const { importHtml } = await import("../import.ts");
  const { imageSelection } = await import("../imageselect.ts");
  const engine = setup();
  engine.setDocument(importHtml('<p>a<img src="https://example.test/a.png" alt="old" width="100" height="50">b</p>'));
  assert.equal(engine.commands.state("image.update").enabled, false, "off with no image selected");
  assert.equal(engine.commands.run("image.update", { alt: "x" }), false);
  engine.setSelection(imageSelection([0], 1));
  assert.deepEqual(engine.commands.state("image.update").value, { alt: "old", width: "100", height: "50", align: "", caption: "" });
  assert.equal(engine.commands.state("image.update").value, engine.commands.state("image.update").value, "the same object while nothing changed");
  assert.equal(engine.commands.run("image.update", { width: "300px" }), true);
  assert.equal(exportHtml(engine.document), '<p>a<img src="https://example.test/a.png" alt="old" width="300">b</p>');
  assert.equal(engine.commands.run("image.update", { alt: " A cat ", height: 120 }), true);
  assert.equal(exportHtml(engine.document), '<p>a<img src="https://example.test/a.png" alt="A cat" width="300" height="120">b</p>');
  for (const bad of [0, -5, 10001, 1.5, "wide", "12em"]) assert.equal(engine.commands.run("image.update", { width: bad }), false, String(bad));
  assert.equal(engine.commands.run("image.update", { alt: null, width: null, height: null }), true);
  assert.equal(exportHtml(engine.document), '<p>a<img src="https://example.test/a.png">b</p>');
  engine.undo();
  assert.match(exportHtml(engine.document), /alt="A cat" width="300" height="120"/, "one undo step");
  engine.setSelection(imageSelection([0], 1));
  assert.equal(engine.commands.run("image.update", { path: [0], offset: 0, width: 40 }), false, "no image at that place");
});

test("image position and captions: written and read back, and set by image.update", async () => {
  const { importHtml } = await import("../import.ts");
  const { imageSelection } = await import("../imageselect.ts");
  const src = "https://example.test/a.png";
  for (const [style, align] of [["float: left; margin: 0 1em 0.5em 0;", "left"], ["float: right; margin: 0 0 0.5em 1em;", "right"], ["display: block; margin: 0 auto;", "center"]] as const) {
    const html = `<p>a<img src="${src}" style="${style}">b</p>`;
    assert.equal(exportHtml(importHtml(html)), html, align);
  }
  assert.equal(exportHtml(importHtml(`<p><img src="${src}" align="right"></p>`)), `<p><img src="${src}" style="float: right; margin: 0 0 0.5em 1em;"></p>`, "the old align attribute");
  assert.equal(exportHtml(importHtml(`<p><img src="${src}" style="float: none; position: absolute"></p>`)), `<p><img src="${src}"></p>`, "other styles are dropped");
  const figure = `<figure><img src="${src}" alt="A cat"><figcaption>My <b>cat</b> &amp; me</figcaption></figure>`;
  assert.equal(exportHtml(importHtml(figure)), `<figure><img src="${src}" alt="A cat"><figcaption>My cat &amp; me</figcaption></figure>`, "a figure is a captioned image; the caption is text");
  assert.equal(exportHtml(importHtml(`<figure style="text-align: center"><img src="${src}"><figcaption>c</figcaption></figure>`)), `<figure style="text-align: center;"><img src="${src}"><figcaption>c</figcaption></figure>`, "the figure's alignment is the paragraph's");
  assert.equal(exportHtml(importHtml(`<figure><img src="${src}"></figure>`)), `<p><img src="${src}"></p>`, "no caption, no figure");
  assert.equal(exportHtml(importHtml(`<figure><img src="${src}"><img src="${src}"><figcaption>two</figcaption></figure>`)), `<p><img src="${src}"><img src="${src}"></p><p>two</p>`, "two pictures make no figure");

  const engine = setup();
  engine.setDocument(importHtml(`<p><img src="${src}"></p><p>a<img src="${src}">b</p>`));
  engine.setSelection(imageSelection([0], 0));
  assert.equal(engine.commands.run("image.update", { align: "left", caption: " Hello " }), true);
  assert.equal(exportHtml(engine.document), `<figure><img src="${src}"><figcaption>Hello</figcaption></figure><p>a<img src="${src}">b</p>`, "a captioned image writes its position as the figure's, not on the picture");
  assert.deepEqual(engine.commands.state("image.update").value, { alt: "", width: "", height: "", align: "left", caption: "Hello" });
  assert.equal(engine.commands.run("image.update", { align: "diagonal" }), false);
  assert.equal(engine.commands.run("image.update", { caption: null, align: "" }), true);
  assert.equal(exportHtml(engine.document), `<p><img src="${src}"></p><p>a<img src="${src}">b</p>`);
  engine.setSelection(imageSelection([1], 1));
  assert.equal(engine.commands.run("image.update", { align: "right", caption: "kept" }), true);
  const beside = `<p><img src="${src}"></p><p>a<img src="${src}" style="float: right; margin: 0 0 0.5em 1em;" data-caption="kept">b</p>`;
  assert.equal(exportHtml(engine.document), beside, "beside text it floats, and the caption is kept in an attribute");
  assert.equal(exportHtml(importHtml(beside)), beside, "and read back from it");
  const alone = importHtml(`<p><img src="${src}" data-caption="Back"></p>`);
  assert.equal(exportHtml(alone), `<figure><img src="${src}"><figcaption>Back</figcaption></figure>`, "alone in its paragraph, the kept caption is a figure again");
});
