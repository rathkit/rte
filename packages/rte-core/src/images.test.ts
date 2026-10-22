import assert from "node:assert/strict";
import { test } from "node:test";
import { collectImages, dataImageBytes, mapImages, readDataImage, rewriteImages } from "./images.ts";
import { importBlocks } from "./import.ts";
import { exportHtml } from "./export.ts";
import { encodeBase64 } from "./svg.ts";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ";

test("the decoded size of a data address is worked out without decoding it", () => {
  const bytes = new Uint8Array(1000).fill(7);
  const url = `data:image/png;base64,${encodeBase64(bytes)}`;
  assert.equal(dataImageBytes(url), 1000);
  assert.equal(dataImageBytes("https://x.test/a.png"), 0);
  assert.equal(readDataImage(url)?.bytes.length, 1000);
  assert.equal(readDataImage("data:image/png;base64,!!!"), undefined);
});

test("images are found and rewritten wherever they sit, side by side when asynchronous", async () => {
  const blocks = importBlocks(`<p><img src="${png}"></p><ul><li>a<img src="https://x.test/1.png"></li></ul><table><tr><td><img src="${png}"></td></tr></table><blockquote><p><img src="${png}"></p></blockquote>`);
  assert.equal(collectImages(blocks).length, 4);
  let running = 0;
  let most = 0;
  const out = await rewriteImages(blocks, async (image) => {
    if (!image.src.startsWith("data:")) return image;
    running++;
    most = Math.max(most, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return { ...image, src: "https://cdn.test/up.png" };
  });
  assert.ok(most > 1, "uploads ran one after another");
  assert.ok(!exportHtml({ blocks: out }).includes("data:"));
  assert.equal(collectImages(out).length, 4);
  const dropped = mapImages(blocks, (image) => (image.src.startsWith("data:") ? undefined : image));
  assert.equal(collectImages(dropped).length, 1);
});

test("removing an image leaves no empty block behind, but keeps text and empty cells", () => {
  const blocks = importBlocks(`<p>a</p><p><img src="${png}"></p><p>b <img src="${png}"></p><ul><li><img src="${png}"></li><li>c</li></ul><table><tr><td><img src="${png}"></td></tr></table>`);
  const out = exportHtml({ blocks: mapImages(blocks, () => undefined) });
  assert.equal(out, "<p>a</p><p>b&nbsp;</p><ul><li>c</li></ul><table><tbody><tr><td></td></tr></tbody></table>");
});
