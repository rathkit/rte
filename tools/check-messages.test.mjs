import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPack } from "./check-messages.mjs";

// A small catalog in the catalog's shape: words, a plural message and a value in braces. The real one needs the built packages
// (`pnpm check:messages` runs it in CI, after the build).
const catalog = {
  "dialog.ok": "OK",
  "toggle.on": "{label} on",
  "status.words": { one: "{count} word", other: "{count} words" },
};
const de = (messages) => ({ locale: "de", messages });
const complete = { "dialog.ok": "OK", "toggle.on": "{label} an", "status.words": { one: "{count} Wort", other: "{count} Wörter" } };

test("a complete pack has no problems", () => {
  assert.deepEqual(checkPack(de(complete), catalog), { missing: [], unused: [], wrong: [] });
});

test("a key the pack lacks is missing, and a key nothing says is unused", () => {
  const { "dialog.ok": _, ...rest } = complete;
  const result = checkPack(de({ ...rest, "dialog.okay": "OK" }), catalog);
  assert.deepEqual(result.missing, ["dialog.ok"]);
  assert.deepEqual(result.unused, ["dialog.okay"]);
});

test("plural forms follow the language's own categories: Arabic needs six, and German has no `few`", () => {
  const ar = checkPack({ locale: "ar", messages: { ...complete, "status.words": { one: "كلمة واحدة", other: "{count} كلمة" } } }, catalog);
  assert.deepEqual(ar.missing, ["status.words:zero", "status.words:two", "status.words:few", "status.words:many"]);
  const extra = checkPack(de({ ...complete, "status.words": { one: "{count} Wort", few: "{count} Wörter", other: "{count} Wörter" } }), catalog);
  assert.deepEqual(extra.unused, ["status.words:few"]);
});

test("words where English has plural forms, and plural forms where it has words, are wrong", () => {
  const result = checkPack(de({ ...complete, "status.words": "{count} Wörter", "dialog.ok": { one: "OK", other: "OK" } }), catalog);
  assert.equal(result.wrong.length, 2);
  assert.match(result.wrong.join("\n"), /status\.words needs plural forms \(one, other\)/);
  assert.match(result.wrong.join("\n"), /dialog\.ok is words in English/);
});

test("a value in braces that the English does not have is wrong (it would be said as nothing)", () => {
  const result = checkPack(de({ ...complete, "toggle.on": "{lable} an" }), catalog);
  assert.deepEqual(result.wrong, ["toggle.on has {lable}, which the English does not"]);
});

test("a locale the platform does not know, a direction that is neither way, and a pack that is not one are reported", () => {
  assert.match(checkPack({ locale: "not a tag", messages: complete }, catalog).wrong.join(), /locale/);
  assert.match(checkPack({ locale: "de", dir: "up", messages: complete }, catalog).wrong.join(), /dir/);
  assert.match(checkPack({ locale: "de" }, catalog).wrong.join(), /default export/);
});
