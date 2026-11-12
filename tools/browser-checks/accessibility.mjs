// The keyboard, contrast, motion and zoom audit (roadmap 5.5, docs/ACCESSIBILITY.md): every surface of the styled interface reached and used with
// the keyboard alone, a visible focus everywhere with its contrast measured against what is next to it, the contrast of every piece of text and
// every control in each shipped theme, forced colors, reduced motion, a 320 by 256 window (1280 by 1024 at 400% zoom), target sizes, focus that is
// never hidden, and no keyboard trap. Called from run.mjs with its helpers, so the checks are counted with the others.

import { readFileSync } from "node:fs";

// Put in every page before it loads: colors and contrast as WCAG 2.2 computes them, and what an element is drawn on.
function helpers() {
  const parse = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return s === "transparent" ? [0, 0, 0, 0] : null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const channel = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  /** The solid color an element is drawn on: its own background and those under it, mixed, down to the first that is solid (the page is white under all). */
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor) ?? [0, 0, 0, 0];
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
      // A modal dialog sits in the top layer, over its backdrop, not over its parents.
      if (e.tagName === "DIALOG" && e.open) break;
    }
    let color = [255, 255, 255, 1];
    for (const c of layers.reverse()) color = over(c, color);
    return color;
  };
  const shown = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && c.display !== "none"; };
  const off = (el) => !!el.closest('[aria-disabled="true"], :disabled');
  const label = (el) => `${el.tagName.toLowerCase()}[${el.getAttribute("data-rte-item") ?? el.getAttribute("data-rte-part") ?? el.getAttribute("role") ?? el.getAttribute("aria-label") ?? ""}]`;
  /** Every piece of text under `scope` that is shown and not part of a disabled control, with its contrast; large text needs 3:1, the rest 4.5:1. */
  const textContrast = (scope) => {
    const out = [];
    const all = [scope, ...scope.querySelectorAll("*")];
    for (const el of all) {
      if (!shown(el) || off(el) || el.closest("[aria-hidden=true]")) continue;
      const c = getComputedStyle(el);
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const before = getComputedStyle(el, "::before");
      const pseudo = before.content && before.content !== "none" && before.content !== "normal" && before.content !== '""';
      for (const [has, style] of [[own, c], [pseudo, before]]) {
        if (!has) continue;
        if (parse(style.color)?.[3] === 0) continue;
        const fg = over(parse(style.color), background(el));
        const r = ratio(fg, background(el));
        const size = Number.parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        out.push({ what: `${label(el)}${style === before ? "::before" : ""} "${(style === before ? before.content : el.textContent).trim().slice(0, 20)}"`, ratio: Math.round(r * 100) / 100, need: large ? 3 : 4.5 });
      }
    }
    return out;
  };
  /** What a focused element shows: its own outline, or the editor's ring when it is inside the writing area, with the ring's contrast against what it is drawn on. */
  const focusRing = (el = document.activeElement) => {
    const own = getComputedStyle(el);
    const root = el.closest(".rte-root");
    const useRoot = !(own.outlineStyle !== "none" && Number.parseFloat(own.outlineWidth) > 0) && root;
    const holder = useRoot ? root : el;
    const c = getComputedStyle(holder);
    if (c.outlineStyle === "none" || Number.parseFloat(c.outlineWidth) <= 0) return { what: label(el), ring: false };
    // An outline drawn outside the box sits on the parent's background; one drawn inside sits on the element's own.
    const inside = Number.parseFloat(c.outlineOffset) + Number.parseFloat(c.outlineWidth) <= 0;
    const under = background(inside ? holder : holder.parentElement ?? holder);
    return { what: label(el), ring: true, holder: useRoot ? "root" : "own", width: Number.parseFloat(c.outlineWidth), ratio: Math.round(ratio(parse(c.outlineColor), under) * 100) / 100 };
  };
  /** Pointer targets smaller than 24 by 24 CSS pixels that a 24 pixel circle round their middle would run into another target from (WCAG 2.2, 2.5.8). */
  const smallTargets = (targets) => {
    const boxes = targets.filter(shown).map((el) => ({ el, r: el.getBoundingClientRect() }));
    const bad = [];
    for (const { el, r } of boxes) {
      if (r.width >= 24 && r.height >= 24) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hits = boxes.filter((o) => o.el !== el && !o.el.contains(el) && !el.contains(o.el) && !(el.labels && [...el.labels].includes(o.el))).some((o) => {
        const dx = Math.max(o.r.left - cx, 0, cx - o.r.right);
        const dy = Math.max(o.r.top - cy, 0, cy - o.r.bottom);
        return Math.hypot(dx, dy) < 12;
      });
      if (hits) bad.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return bad;
  };
  /** True when some of the element can be seen: a point of it is not under something else (WCAG 2.2, 2.4.11). */
  const visible = (el = document.activeElement) => {
    const r = el.getBoundingClientRect();
    const xs = [r.left + 2, r.left + r.width / 2, r.right - 2];
    const ys = [r.top + 2, r.top + r.height / 2, r.bottom - 2];
    for (const x of xs) for (const y of ys) {
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit) || (hit.shadowRoot && hit.contains(el)))) return true;
    }
    return false;
  };
  const firstText = (el) => document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
  window.__a11y = { firstText, parse, ratio, background, textContrast, focusRing, smallTargets, visible, label, shown };
}

const sample = `<h1>Heading</h1><p>Text with a <a href="https://example.com/">link</a>, <code>code</code>, <strong>bold</strong> and a note.</p>
<blockquote><p>A quotation.</p></blockquote><pre>code block</pre>
<ul><li><input type="checkbox" disabled> open task</li><li><input type="checkbox" disabled checked> done task</li></ul>
<table><tbody><tr><th>Head</th><th>Head</th></tr><tr><td>cell <a href="https://example.com/">link</a></td><td>cell</td></tr></tbody></table><p>end</p>`;

/** Contrast of two #rrggbb colors, as WCAG 2.2 computes it. */
function contrast(a, b) {
  const lum = (hex) => { const n = Number.parseInt(hex.slice(1), 16); return [16, 8, 0].map((s) => { const c = ((n >> s) & 255) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0); };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export async function accessibilityAudit({ engines, open, check, onePixelPng }) {
  // Find's matches: the one being looked at must differ from the others by more than hue (1.4.1), with the text readable on both (1.4.3).
  const base = readFileSync(new URL("../../packages/rte-ui/css/base.css", import.meta.url), "utf8");
  const paint = (name) => { const m = new RegExp(`::highlight\\(${name}\\) \\{ background-color: (#[0-9a-f]{6}); color: (#[0-9a-f]{6});`).exec(base); return m ? { bg: m[1], fg: m[2] } : null; };
  const [all, current] = [paint("rte-find"), paint("rte-find-current")];
  const found = all && current ? { lightness: contrast(all.bg, current.bg), text: Math.min(contrast(all.fg, all.bg), contrast(current.fg, current.bg)) } : null;
  check("(a11y) find: the current match is 3:1 apart from the other matches in lightness, and the text keeps 4.5:1 on both", !!found && found.lightness >= 3 && found.text >= 4.5, found);
  for (const [name, type] of engines) {
    const t = await open(type, {}, "", "ui", helpers);
    const { page } = t;
    const active = () => page.evaluate(() => { const a = document.activeElement; return { id: a.closest("[id]")?.id ?? null, item: a.getAttribute("data-rte-item"), part: a.getAttribute("data-rte-part"), role: a.getAttribute("role"), tag: a.tagName.toLowerCase(), label: a.getAttribute("aria-label") }; });
    const key = async (k, wait = 40) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
    const setHtml = (id, html) => page.evaluate(([i, h]) => { const e = window[i].editor; e.setHtml(h); e.focus(); }, [id, html]);
    const caret = (id, sel, offset = 1, end = offset) => page.evaluate(([i, s, o, e]) => {
      const ed = window[i].editor;
      const n = document.querySelector(`#${i === "__one" ? "root" : i === "__two" ? "second" : "third"} [data-rte-part=content] ${s}`);
      // The first text of the element's own, not a task's checkbox drawn in front of it.
      const tx = document.createTreeWalker(n, NodeFilter.SHOW_TEXT, { acceptNode: (x) => (x.parentElement.closest("[data-rte-check]") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) }).nextNode();
      ed.focus();
      ed.selectDom(tx, o, tx, e);
    }, [id, sel, offset, end]);
    const rings = [];
    const hidden = [];
    // Every stop the keyboard reaches is looked at the same way: a ring with 3:1, and not covered.
    const look = async (where) => {
      const r = await page.evaluate(() => ({ ring: window.__a11y.focusRing(), seen: window.__a11y.visible() }));
      rings.push({ where, ...r.ring });
      if (!r.seen) hidden.push(`${where} ${r.ring.what}`);
    };

    // --- reaching the toolbar from the page, every control in it with the arrow keys, Home and End
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await key("Tab");
    check(`${name} (a11y) Tab from the top of the page reaches the first editor's toolbar`, (await active()).item === "undo", await active());
    const items = await page.evaluate(() => [...document.querySelectorAll("#root [data-rte-part=toolbar] [data-rte-item]")].map((e) => e.getAttribute("data-rte-item")));
    const reached = new Set();
    for (let i = 0; i < items.length + 2; i++) {
      const a = await active();
      if (a.item) reached.add(a.item);
      if (i % 4 === 0) await look(`toolbar ${a.item}`);
      await key("ArrowRight", 10);
    }
    check(`${name} (a11y) the arrow keys reach every toolbar control (${items.length})`, items.every((i) => reached.has(i)), items.filter((i) => !reached.has(i)));
    await key("End");
    const last = (await active()).item;
    await key("Home");
    check(`${name} (a11y) Home and End jump to the first and last control`, last === items.at(-1) && (await active()).item === items[0], [last, (await active()).item]);
    await key("Tab");
    check(`${name} (a11y) Tab from the toolbar goes to the writing area (one tab stop for the whole toolbar)`, (await active()).role === "textbox" && (await active()).id === "root", await active());
    await look("writing area");
    await key("Shift+Tab");
    check(`${name} (a11y) Shift+Tab from the writing area goes back to the toolbar`, (await active()).item === items[0], await active());
    // Enter and Space press a button.
    await setHtml("__one", "<p>one two</p>");
    await caret("__one", "p", 0, 3);
    await key("Shift+Tab");
    const bold = items.indexOf("bold");
    for (let i = 0; i < bold; i++) await key("ArrowRight", 5);
    await key("Enter");
    const afterEnter = await page.evaluate(() => window.__one.editor.getHtml());
    await setHtml("__one", "<p>one two</p>");
    await caret("__one", "p", 4, 7);
    await key("Shift+Tab");
    await key("Space");
    check(`${name} (a11y) Enter and Space press a toolbar button`, afterEnter === "<p><strong>one</strong> two</p>" && (await page.evaluate(() => window.__one.editor.getHtml())) === "<p>one <strong>two</strong></p>", [afterEnter, await page.evaluate(() => window.__one.editor.getHtml())]);
    // The block-type list is the browser's own select: it is in the toolbar and takes the focus like the rest.
    check(`${name} (a11y) the block-type list is a native select in the roving order`, reached.has("block") && (await page.evaluate(() => document.querySelector("#root [data-rte-item=block]").tagName)) === "SELECT", "select");

    // --- tooltips: shown on keyboard focus, dismissed with Escape without moving the focus (1.4.13)
    await page.evaluate(() => document.querySelector("#root [data-rte-item=italic]").focus());
    await key("ArrowRight", 120);
    const tip = await page.evaluate(() => { const t = document.querySelector("#root [data-rte-part=tooltip]"); return { shown: !t.hidden, text: t.textContent }; });
    await key("Escape");
    check(`${name} (a11y) a tooltip shows on keyboard focus and Escape hides it, leaving the focus where it was`, tip.shown && (await page.evaluate(() => document.querySelector("#root [data-rte-part=tooltip]").hidden)) && (await active()).item === "underline", [tip, await active()]);

    // --- every menu: opened from the keyboard, every entry reached with the arrows, Escape back to its button
    await setHtml("__one", sample);
    await caret("__one", "td", 1);
    const menus = await page.evaluate(() => [...document.querySelectorAll("#root [data-rte-part=toolbar] [aria-haspopup=menu]")].map((e) => e.getAttribute("data-rte-item")));
    const menuProblems = [];
    for (const id of menus) {
      await page.evaluate((i) => document.querySelector(`#root [data-rte-item="${i}"]`).focus(), id);
      await key("Enter", 80);
      const count = await page.evaluate((i) => document.querySelector(`#root [data-rte-item="${i}"] + [data-rte-part=menu]`).querySelectorAll("[role^=menuitem]").length, id);
      const seen = new Set();
      for (let i = 0; i < count + 1; i++) {
        seen.add(await page.evaluate(() => (document.activeElement.closest("[role=menu]") ? document.activeElement.textContent : null)));
        if (i === 1) await look(`menu ${id} entry`);
        await key("ArrowDown", 5);
      }
      seen.delete(null);
      await key("Escape");
      const back = (await active()).item === id;
      if (seen.size !== count || !back) menuProblems.push({ id, count, reached: seen.size, back });
    }
    check(`${name} (a11y) every toolbar menu (${menus.length}) opens with Enter, every entry is reached with the arrows, and Escape returns to its button`, menus.length >= 6 && menuProblems.length === 0, menuProblems);

    // --- the table grips have the keyboard's way to the same thing in the Table menu: move a row, set a column's width
    await setHtml("__one", "<table><tbody><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></tbody></table><p>end</p>");
    await caret("__one", "td", 1);
    const grips = await page.evaluate(() => [...document.querySelectorAll("[data-rte-grip]")].map((g) => g.getAttribute("data-rte-grip")).sort().join());
    const chooseIn = async (menu, text) => {
      await page.evaluate((i) => document.querySelector(`#root [data-rte-item="${i}"]`).focus(), menu);
      await key("Enter", 80);
      for (let i = 0; i < 30; i++) {
        if (await page.evaluate((x) => document.activeElement.textContent.startsWith(x), text)) break;
        await key("ArrowDown", 5);
      }
      await key("Enter", 120);
    };
    await chooseIn("table", "Move row down");
    check(`${name} (a11y) the row grip's move is in the Table menu: Move row down, by keyboard`, grips === "column,row" && (await page.evaluate(() => window.__one.editor.getHtml())).startsWith("<table><tbody><tr><td>a2</td>"), [grips, await page.evaluate(() => window.__one.editor.getHtml())]);
    await caret("__one", "td", 1);
    await chooseIn("table", "Column width");
    const widthDialog = await page.evaluate(() => { const d = [...document.querySelectorAll("#root dialog")].find((x) => x.open); return !!d && d.contains(document.activeElement); });
    await look("column width dialog field");
    await page.keyboard.type("120");
    await key("Enter", 120);
    check(`${name} (a11y) a column's width (the width grip, on a touch screen) is set from the keyboard in the Column width dialog`, widthDialog && /<col style="width: 120px">/.test(await page.evaluate(() => window.__one.editor.getHtml())), await page.evaluate(() => window.__one.editor.getHtml()));

    // --- the image's resize handle has the Image properties dialog: an image picked with the keyboard, its width set there
    await page.evaluate((src) => { const e = window.__one.editor; e.setHtml(`<p>a<img src="${src}" alt="dot" width="60">b</p>`); e.focus(); }, onePixelPng());
    await caret("__one", "p", 1);
    await key("Shift+ArrowRight", 80);
    const picked = await page.evaluate(() => document.querySelectorAll("#root img[data-rte-image-selected]").length === 1);
    await key("Shift+Tab");
    await page.keyboard.press("End");
    for (let i = 0; i < 60 && (await active()).item !== "image-properties"; i++) await key("ArrowLeft", 5);
    await key("Enter", 120);
    const field = await page.evaluate(() => { const a = document.activeElement; return a.closest("dialog")?.open ? a.name : null; });
    // Tab to the width field, whatever comes first in the dialog.
    for (let i = 0; i < 6 && (await page.evaluate(() => document.activeElement.name)) !== "width"; i++) await key("Tab", 10);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("90");
    await key("Enter", 120);
    check(`${name} (a11y) an image picked with Shift+Arrow gets its size from the Image properties dialog, all by keyboard`, picked && !!field && /width="90"/.test(await page.evaluate(() => window.__one.editor.getHtml())), [picked, field, (await page.evaluate(() => window.__one.editor.getHtml())).replace(/src="[^"]*"/, "src=…")]);

    // --- every dialog on the toolbar: opened with Enter, every field and button reached with Tab, which stays inside, and Escape back to the opener
    await setHtml("__one", "<p>one two</p>");
    await caret("__one", "p", 0, 3);
    const dialogProblems = [];
    for (const id of ["link", "image", "shortcuts"]) {
      await caret("__one", "p", 0, 3);
      await page.evaluate((i) => document.querySelector(`#root [data-rte-item="${i}"]`).focus(), id);
      await key("Enter", 120);
      // Its controls, named as the walk below names the focused element. The dialog itself, or a part of it that scrolls, may be a stop too.
      const wanted = await page.evaluate(() => { const d = [...document.querySelectorAll("#root dialog")].find((x) => x.open); return d ? [...d.querySelectorAll("input, select, textarea, button")].filter((e) => window.__a11y.shown(e)).map((a) => `${a.tagName}:${a.name || a.textContent}`) : []; });
      const controls = wanted.length;
      const seen = new Set();
      let outside = false;
      for (let i = 0; i < controls * 2 + 1; i++) {
        const where = await page.evaluate(() => { const d = [...document.querySelectorAll("#root dialog")].find((x) => x.open); const a = document.activeElement; return d && d.contains(a) ? `${a.tagName}:${a.name || a.textContent}` : a === document.body ? "body" : "outside"; });
        // The browser itself may take the focus to its own interface on the way round (the address bar): that is not the page.
        if (where === "outside") outside = true;
        else if (where !== "body") seen.add(where);
        if (i < controls) await look(`dialog ${id} ${where}`);
        await key("Tab", 10);
      }
      await key("Escape", 100);
      const back = await page.evaluate(() => [...document.querySelectorAll("#root dialog")].every((d) => !d.open));
      const opener = (await active()).item;
      if (controls < 1 || wanted.some((w) => !seen.has(w)) || outside || !back || opener !== id) dialogProblems.push({ id, wanted, seen: [...seen], outside, back, opener });
    }
    check(`${name} (a11y) the link, image and shortcuts dialogs: every control reached with Tab, the focus kept inside, Escape back to the opener`, dialogProblems.length === 0, dialogProblems);
    // The shortcuts dialog tells how to leave the writing area, since Tab there can be taken by a list or a table.
    await page.evaluate(() => document.querySelector("#root [data-rte-item=shortcuts]").focus());
    await key("Enter", 120);
    const listed = await page.evaluate(() => [...document.querySelectorAll("#root [data-rte-part=shortcuts] tr")].map((r) => r.textContent));
    await key("Escape", 100);
    check(`${name} (a11y) the keyboard shortcuts dialog says how to leave the writing area (Escape, then Tab)`, listed.some((r) => /Escape/.test(r) && /Tab/.test(r)), listed.slice(0, 40));

    // --- the find bar: Mod-f, every control by Tab in the order it is drawn, Escape back to the writing area
    await setHtml("__one", "<p>alpha beta alpha</p>");
    await caret("__one", "p", 0);
    await key("ControlOrMeta+f", 120);
    const inFind = (await active()).part === "find-field";
    await page.keyboard.type("alpha");
    await page.waitForTimeout(100);
    const findOrder = [];
    for (let i = 0; i < 10; i++) {
      const a = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return a.closest("[data-rte-part=findbar]") ? { name: a.getAttribute("aria-label") || a.name || a.textContent, x: Math.round(r.left), y: Math.round(r.top) } : null; });
      if (!a) break;
      findOrder.push(a);
      await look(`find bar ${a.name}`);
      await key("Tab", 10);
    }
    const leftFind = await active();
    const readingOrder = findOrder.every((a, i) => i === 0 || a.y > findOrder[i - 1].y + 2 || (Math.abs(a.y - findOrder[i - 1].y) <= 8 && a.x > findOrder[i - 1].x));
    check(`${name} (a11y) Mod-f opens the find bar with the focus in it; Tab goes through its controls in reading order and then to the writing area`, inFind && findOrder.length >= 8 && readingOrder && leftFind.role === "textbox", { inFind, findOrder, leftFind });
    await page.evaluate(() => document.querySelector("#root [data-rte-part=find-field]").focus());
    await key("Escape", 80);
    check(`${name} (a11y) Escape closes the find bar and puts the focus back in the writing area`, (await active()).role === "textbox" && (await page.evaluate(() => document.querySelector("#root [data-rte-part=findbar]").hidden)), await active());

    // --- the HTML source view: the toolbar button by keyboard, a text box that Tab leaves, Escape back
    await page.evaluate(() => document.querySelector("#root [data-rte-item=source]").focus());
    await key("Enter", 120);
    const inSource = (await active()).part === "source";
    await look("source view");
    await key("Tab");
    const fromSource = await active();
    await page.evaluate(() => document.querySelector("#root [data-rte-part=source]").focus());
    await key("Escape", 100);
    check(`${name} (a11y) the source view opens from the keyboard with the focus in it, Tab leaves it, and Escape closes it`, inSource && fromSource.part !== "source" && (await page.evaluate(() => document.querySelector("#root [data-rte-part=source]")?.hidden ?? true)), { inSource, fromSource, after: await active() });

    // --- footnotes and task checkboxes: their keys
    await setHtml("__one", "<p>text</p>");
    await caret("__one", "p", 4);
    await key("ControlOrMeta+Alt+f", 80);
    const inserted = await page.evaluate(() => /data-rte-note|<sup/.test(document.querySelector("#root [data-rte-part=content]").innerHTML));
    await page.keyboard.type("note");
    await key("ControlOrMeta+Alt+Shift+f", 80);
    const back = await page.evaluate(() => { const s = getSelection(); return !!s.anchorNode && !s.anchorNode.parentElement?.closest("[data-rte-notes]"); });
    check(`${name} (a11y) a footnote is put in and jumped to and from by keyboard (Mod-Alt-F, Mod-Alt-Shift-F)`, inserted && back, { inserted, back });
    await setHtml("__one", '<ul><li><input type="checkbox" disabled> task</li></ul>');
    await caret("__one", "li", 2);
    await key("ControlOrMeta+Enter", 80);
    check(`${name} (a11y) a task is ticked by keyboard (Mod-Enter)`, (await page.evaluate(() => document.querySelector("#root [data-rte-check]")?.getAttribute("aria-checked"))) === "true", await page.evaluate(() => window.__one.editor.getHtml()));

    // --- no keyboard trap: whatever the document ends with, Escape and then Tab leave the writing area, and the document is unchanged
    const trap = [];
    for (const [doc, where] of [["<p>text</p>", "p"], ["<ul><li>a<ul><li>b</li></ul></li></ul>", "li li"], ["<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>", "td:last-child"], ["<pre>code</pre>", "pre"]]) {
      await setHtml("__one", doc);
      await caret("__one", where, 1);
      const before = await page.evaluate(() => window.__one.editor.getHtml());
      await key("Escape");
      await key("Tab");
      const a = await active();
      const after = await page.evaluate(() => window.__one.editor.getHtml());
      if (a.id === "root" && a.role === "textbox") trap.push({ doc, a });
      if (after !== before) trap.push({ doc, changed: after });
    }
    check(`${name} (a11y) no keyboard trap: Escape then Tab leaves the writing area at the end of a paragraph, a nested list, a table and code, changing nothing`, trap.length === 0, trap);
    await setHtml("__one", "<ul><li>a</li><li>b</li></ul>");
    await caret("__one", "li:last-child", 1);
    await key("Escape");
    await key("ArrowLeft");
    await key("Tab");
    check(`${name} (a11y) after Escape, any other key gives Tab back to the list (it indents again)`, (await page.evaluate(() => window.__one.editor.getHtml())) === "<ul><li>a<ul><li>b</li></ul></li></ul>", await page.evaluate(() => window.__one.editor.getHtml()));
    // Shift+Tab from the second editor's toolbar goes back into the first editor (the page is not a dead end either way).
    await page.evaluate(() => document.querySelector("#second [data-rte-part=toolbar] [tabindex='0']").focus());
    await key("Shift+Tab");
    check(`${name} (a11y) Shift+Tab from an editor's toolbar goes back to the editor before it`, (await active()).id === "root", await active());

    // --- the selection toolbar and the context menu (the second editor has both)
    await setHtml("__two", "<p>one two three</p>");
    await caret("__two", "p", 0);
    for (let i = 0; i < 3; i++) await key("Shift+ArrowRight", 10);
    await page.waitForTimeout(250);
    const barShown = await page.evaluate(() => !document.querySelector("#second [data-rte-part=floating]").hidden);
    await key("Alt+F10", 80);
    const inBar = await page.evaluate(() => !!document.activeElement.closest("#second [data-rte-part=floating]"));
    await look("selection toolbar");
    await key("ArrowRight");
    const moved = await page.evaluate(() => document.activeElement.getAttribute("data-rte-item"));
    await key("Escape");
    await key("Escape");
    check(`${name} (a11y) a keyboard selection shows the selection toolbar; Alt+F10 goes in, arrows move, Escape comes back to the text`, barShown && inBar && moved === "italic" && (await active()).role === "textbox" && (await active()).id === "second", { barShown, inBar, moved, after: await active() });
    await caret("__two", "p", 4);
    await page.evaluate(() => { window.__ctx = 0; document.addEventListener("contextmenu", () => window.__ctx++, { once: true, capture: true }); });
    await key("Shift+F10", 120);
    // Only some browsers send a context menu event for the key (it is the system's key); where one does, the editor's menu must open on it.
    if (await page.evaluate(() => window.__ctx > 0)) {
      const inMenu = await page.evaluate(() => document.activeElement.getAttribute("role")?.startsWith("menuitem") ?? false);
      await look("context menu");
      await key("ArrowDown");
      await key("Escape", 80);
      check(`${name} (a11y) Shift+F10 opens the context menu with the focus on its first entry, and Escape comes back to the text`, inMenu && (await active()).role === "textbox", { inMenu, after: await active() });
    }

    // --- focus order: down the page, toolbar, find bar, writing area, then the next editor
    await page.evaluate(() => { window.__one.editor.setHtml("<p>x</p>"); document.querySelector("#root [data-rte-item=find]").click(); });
    await page.waitForTimeout(100);
    await page.evaluate(() => document.querySelector("#root [data-rte-part=find-field]").focus());
    await key("Shift+Tab");
    const order = [];
    for (let i = 0; i < 14; i++) {
      order.push(await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { id: a.closest("[id]")?.id, part: a.getAttribute("data-rte-part") ?? a.getAttribute("role"), top: Math.round(r.top + scrollY) }; }));
      await key("Tab", 10);
    }
    const tops = order.map((o) => o.top);
    check(`${name} (a11y) Tab goes down the page: toolbar, find bar, writing area, next editor`, order[0].part === "button" && order.some((o) => o.part === "find-field") && order.findIndex((o) => o.part === "find-field") < order.findIndex((o) => o.part === "textbox") && order.some((o) => o.id === "second") && tops.every((v, i) => i === 0 || v >= tops[i - 1] - 40), order);
    await page.evaluate(() => document.querySelector("#root [data-rte-part=find-field]").focus());
    await key("Escape");

    // --- what every stop above showed: a ring with 3:1 against what it is drawn on, never covered
    const weak = rings.filter((r) => !r.ring || r.ratio < 3 || r.width < 1);
    check(`${name} (a11y) every keyboard stop (${rings.length}) shows a focus ring at least 1px wide with 3:1 against what is next to it`, rings.length > 30 && weak.length === 0, weak);
    check(`${name} (a11y) no keyboard stop is hidden under a tooltip, menu or bar`, hidden.length === 0, hidden);
    check(`${name} (a11y) no page errors in the keyboard pass`, t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  // --- contrast of every piece of text and every control's ring, in each shipped theme, with every surface open, and target sizes
  for (const [name, type] of engines) {
    const t = await open(type, {}, "", "ui", helpers);
    const { page } = t;
    const key = async (k, wait = 40) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
    for (const [theme, scheme, system] of [["light"], ["dark"], ["auto", undefined, "light"], ["auto", undefined, "dark"], ["auto", "dark", "light"], ["high-contrast"]]) {
      const tag = `${theme}${scheme ? ` (${scheme} chosen)` : system ? ` (system ${system})` : ""}`;
      await page.emulateMedia({ colorScheme: system ?? "light" });
      await page.evaluate(([th, sc, html]) => {
        for (const w of [window.__two, window.__three]) w.ui.setStyle({ theme: th, ...(sc ? { scheme: sc } : {}) });
        window.__two.editor.setHtml(html);
        window.__three.editor.setHtml("");
      }, [theme, scheme, sample]);
      await page.waitForTimeout(250);
      const low = [];
      const scan = async (what) => {
        const found = await page.evaluate(() => [...window.__a11y.textContrast(document.getElementById("second")), ...window.__a11y.textContrast(document.getElementById("third"))]);
        for (const f of found) if (f.ratio < f.need) low.push(`${what}: ${f.what} ${f.ratio}:1`);
        return found.length;
      };
      let pieces = await scan("page");
      // A selected cell, the find bar with a count, a menu, a tooltip, a dialog, the selection toolbar, the context menu.
      await page.evaluate(() => { const e = window.__two.editor; e.focus(); const tds = document.querySelectorAll("#second td"); e.selectDom(window.__a11y.firstText(tds[0]), 0, window.__a11y.firstText(tds[1]), 2); });
      await page.waitForTimeout(80);
      pieces += await scan("selected cells");
      await page.evaluate(() => { const n = window.__a11y.firstText(document.querySelector("#second p")); window.__two.editor.selectDom(n, 0, n, 4); });
      await key("ControlOrMeta+f", 100);
      await page.keyboard.type("cell");
      await page.waitForTimeout(400);
      pieces += await scan("find bar");
      await key("Escape");
      await page.evaluate(() => document.querySelector("#second [data-rte-item=symbols]").click());
      await page.waitForTimeout(80);
      pieces += await scan("menu");
      await key("Escape");
      await page.evaluate(() => document.querySelector("#second [data-rte-item=italic]").focus());
      await key("ArrowRight", 150);
      pieces += await scan("tooltip");
      await page.evaluate(() => document.querySelector("#second [data-rte-item=link]").click());
      await page.waitForTimeout(100);
      await page.keyboard.type("javascript:x");
      await key("Enter", 100);
      pieces += await scan("dialog with an error");
      await key("Escape", 100);
      await page.evaluate(() => { const e = window.__two.editor; e.focus(); const n = window.__a11y.firstText(document.querySelector("#second p")); e.selectDom(n, 0, n, 4); });
      await key("Shift+ArrowRight", 300);
      pieces += await scan("selection toolbar");
      await page.click("#second [data-rte-part=content] h1", { button: "right" });
      await page.waitForTimeout(100);
      pieces += await scan("context menu");
      await key("Escape");
      check(`${name} (a11y) ${tag}: every piece of text on every surface (${pieces}) keeps 4.5:1 (3:1 when large)`, pieces > 100 && low.length === 0, low);

      // Controls and their states: icons, borders of fields and lists, the pressed edge, the focus ring of each kind of control.
      const parts = await page.evaluate(() => {
        const a = window.__a11y;
        const out = [];
        const root = document.getElementById("second");
        const edge = (el, prop) => a.ratio(a.parse(getComputedStyle(el)[prop]), a.background(el.parentElement));
        for (const b of root.querySelectorAll('[data-rte-part=toolbar] button[data-rte-item]:not([aria-disabled="true"])')) out.push([`icon ${b.getAttribute("data-rte-item")}`, a.ratio(a.parse(getComputedStyle(b).color), a.background(b))]);
        for (const s of root.querySelectorAll("select, [data-rte-part=find-field]")) out.push([`edge of ${a.label(s)}`, edge(s, "borderTopColor")]);
        const pressed = root.querySelector('[aria-pressed="true"]');
        if (pressed) out.push(["pressed edge", edge(pressed, "borderBottomColor")]);
        const check = root.querySelector("[data-rte-check]");
        if (check) out.push(["task checkbox", a.ratio(a.parse(getComputedStyle(check).color), a.background(check))]);
        return out.map(([w, r]) => [w, Math.round(r * 100) / 100]);
      });
      // The dialog's fields sit on the raised surface.
      await page.evaluate(() => document.querySelector("#second [data-rte-item=link]").click());
      await page.waitForTimeout(100);
      parts.push(...(await page.evaluate(() => { const a = window.__a11y; const f = [...document.querySelectorAll("#second dialog")].find((d) => d.open).querySelector("input[type=text], input:not([type])"); return [["edge of a dialog field", Math.round(a.ratio(a.parse(getComputedStyle(f).borderTopColor), a.background(f.parentElement)) * 100) / 100]]; })));
      await key("Escape", 100);
      // The table grips and the image handle have one fixed color with a white edge: one of the two must stand out from the writing area.
      const handleEdge = () => page.evaluate(() => {
        const a = window.__a11y;
        const under = a.background(document.querySelector("#second [data-rte-part=content]"));
        return [...document.querySelectorAll("[data-rte-grip], [data-rte-resize-handle] > *")].map((g) => { const c = getComputedStyle(g); return [`${g.hasAttribute("data-rte-grip") ? "table grip" : "image handle"}`, Math.round(Math.max(a.ratio(a.parse(c.backgroundColor), under), a.ratio(a.parse(c.borderTopColor), under)) * 100) / 100]; });
      });
      await page.evaluate(() => { const e = window.__two.editor; e.focus(); const td = window.__a11y.firstText(document.querySelector("#second td")); e.selectDom(td, 1, td, 1); });
      await page.waitForTimeout(100);
      const handles = await handleEdge();
      await page.evaluate((src) => window.__two.editor.setHtml(`<p>a<img src="${src}" alt="dot" width="80">b</p>`), onePixelPng());
      await page.click("#second [data-rte-part=content] img");
      await page.waitForTimeout(100);
      handles.push(...(await handleEdge()));
      check(`${name} (a11y) ${tag}: the table grips and the image handle stand out 3:1 from the writing area`, handles.length === 3 && handles.every(([, r]) => r >= 3), handles);
      // The guides shown while a handle, a grip or a column's edge is dragged: their fill, border or edge must stand out 3:1 from the writing area.
      const guide = () => page.evaluate(() => {
        const a = window.__a11y;
        const g = document.querySelector("[data-rte-resize-line]");
        if (!g) return null;
        const under = a.background(document.querySelector("#second [data-rte-part=content]"));
        const c = getComputedStyle(g);
        const colors = [c.backgroundColor, c.borderTopStyle === "none" ? "transparent" : c.borderTopColor, /rgba?\([^)]*\)/.exec(c.boxShadow)?.[0] ?? "transparent"].map(a.parse).filter((x) => x && x[3] > 0);
        return Math.round(Math.max(0, ...colors.map((x) => a.ratio(x, under))) * 100) / 100;
      });
      const drag = async (sel, dx, dy) => {
        const p = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return s.includes("td") ? { x: r.right - 1, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(p.x + dx, p.y + dy, { steps: 3 });
        const seen = await guide();
        await page.mouse.up();
        await page.waitForTimeout(60);
        return seen;
      };
      const guides = [["image", await drag("[data-rte-resize-handle]", 10, 10)]];
      await page.evaluate((html) => { const e = window.__two.editor; e.setHtml(html); e.focus(); const td = window.__a11y.firstText(document.querySelector("#second td")); e.selectDom(td, 1, td, 1); }, sample);
      await page.waitForTimeout(100);
      guides.push(["row grip", await drag('[data-rte-grip="row"]', 0, 12)]);
      guides.push(["column edge", await drag("#second [data-rte-part=content] td", 12, 0)]);
      check(`${name} (a11y) ${tag}: the guides shown while dragging the image handle, a grip or a column edge stand out 3:1 from the writing area`, guides.every(([, r]) => r !== null && r >= 3), guides);
      const faint = parts.filter(([, r]) => r < 3);
      check(`${name} (a11y) ${tag}: icons, field edges, the pressed edge and the task checkbox keep 3:1 (${parts.length})`, parts.length > 30 && faint.length === 0, faint);

      // The focus ring of the writing area, a button, a field and a menu entry, measured on what it is drawn on.
      const ringOf = async (focus) => { await page.evaluate(focus); await page.waitForTimeout(40); return page.evaluate(() => window.__a11y.focusRing()); };
      await page.evaluate(() => document.querySelector("#second [data-rte-part=toolbar] [tabindex='0']").focus());
      await key("ArrowRight");
      const ringSet = [await page.evaluate(() => window.__a11y.focusRing())];
      ringSet.push(await ringOf(() => window.__two.editor.focus()));
      await key("ControlOrMeta+f", 100);
      ringSet.push(await page.evaluate(() => window.__a11y.focusRing()));
      await key("Escape");
      await page.evaluate(() => document.querySelector("#second [data-rte-item=symbols]").focus());
      await key("Enter", 80);
      await key("ArrowDown");
      ringSet.push(await page.evaluate(() => window.__a11y.focusRing()));
      await key("Escape");
      const badRings = ringSet.filter((r) => !r.ring || r.ratio < 3);
      check(`${name} (a11y) ${tag}: the focus ring of a button, the writing area, a find field and a menu entry keeps 3:1 against what it is drawn on`, badRings.length === 0, ringSet);
    }
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => { for (const w of [window.__two, window.__three]) w.ui.setStyle({ theme: "light" }); });

    // --- target size (2.5.8): every control of every surface is 24 by 24, or has room round it
    await page.evaluate((html) => window.__two.editor.setHtml(html), sample);
    const targets = async () => page.evaluate(() => window.__a11y.smallTargets([...document.querySelectorAll("#second button, #second select, #second input, #second [role^=menuitem], [data-rte-grip], [data-rte-resize-handle]")]));
    const small = [];
    small.push(...(await targets()));
    await page.evaluate(() => document.querySelector("#second [data-rte-item=find]").click());
    await page.waitForTimeout(80);
    small.push(...(await targets()));
    await key("Escape");
    for (const id of ["text-color", "table", "symbols"]) {
      await page.evaluate((i) => document.querySelector(`#second [data-rte-item="${i}"]`).click(), id);
      await page.waitForTimeout(80);
      small.push(...(await targets()));
      await key("Escape");
    }
    // The link dialog, which has a checkbox.
    await page.evaluate(() => { const e = window.__two.editor; e.focus(); const n = window.__a11y.firstText(document.querySelector("#second p")); e.selectDom(n, 0, n, 4); });
    await page.waitForTimeout(80);
    await page.evaluate(() => document.querySelector("#second [data-rte-item=link]").click());
    await page.waitForTimeout(100);
    small.push(...(await page.evaluate(() => window.__a11y.smallTargets([...[...document.querySelectorAll("#second dialog")].find((d) => d.open).querySelectorAll("button, input, label")]))));
    await key("Escape", 100);
    // The selection toolbar and the context menu.
    await page.evaluate(() => { const e = window.__two.editor; e.focus(); const n = window.__a11y.firstText(document.querySelector("#second p")); e.selectDom(n, 0, n, 0); });
    await key("Shift+ArrowRight", 10);
    await key("Shift+ArrowRight", 300);
    const floating = await page.evaluate(() => !document.querySelector("#second [data-rte-part=floating]").hidden);
    small.push(...(await targets()));
    await page.click("#second [data-rte-part=content] p", { button: "right" });
    await page.waitForTimeout(100);
    const context = await page.evaluate(() => [...document.querySelectorAll("#second [data-rte-context]")].some((m) => !m.hidden));
    small.push(...(await targets()));
    await key("Escape");
    await page.evaluate(() => { const e = window.__two.editor; e.focus(); const td = window.__a11y.firstText(document.querySelector("#second td")); e.selectDom(td, 1, td, 1); });
    await page.waitForTimeout(100);
    const gripCount = await page.evaluate(() => document.querySelectorAll("[data-rte-grip]").length);
    small.push(...(await targets()));
    await page.evaluate((src) => { const e = window.__two.editor; e.setHtml(`<p>a<img src="${src}" alt="dot" width="80">b</p>`); }, onePixelPng());
    await page.click("#second [data-rte-part=content] img");
    await page.waitForTimeout(100);
    const handle = await page.evaluate(() => { const h = document.querySelector("[data-rte-resize-handle]"); const r = h?.getBoundingClientRect(); return r ? [r.width, r.height] : null; });
    small.push(...(await targets()));
    check(`${name} (a11y) every pointer target (toolbar, find bar, menus, link dialog, selection toolbar, context menu, table grips, image handle) is 24 by 24 or has a 24px circle of room`, small.length === 0 && floating && context && gripCount === 2 && !!handle && handle[0] >= 24, { small, floating, context, gripCount, handle });
    // Task checkboxes, footnote numbers and links in the text sit in a line of text: the inline exception, as long as they stay within the line.
    await page.evaluate(() => window.__two.editor.setHtml('<ul><li><input type="checkbox" disabled> a task</li></ul><p>A <a href="https://example.com/">link</a>.</p>'));
    await page.waitForTimeout(60);
    const inline = await page.evaluate(() => { const c = document.querySelector("#second [data-rte-check]").getBoundingClientRect(); const li = document.querySelector("#second li").getBoundingClientRect(); return c.height <= li.height + 1; });
    check(`${name} (a11y) a task's checkbox is in its line of text (the inline exception to the target size)`, inline, "inline");
    check(`${name} (a11y) no page errors in the contrast and target pass`, t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  // --- forced colors and reduced motion, with every surface open
  for (const [name, type] of engines) {
    const t = await open(type, {}, "", "ui", helpers);
    const { page } = t;
    const key = async (k, wait = 40) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
    await page.emulateMedia({ forcedColors: "active" });
    if (await page.evaluate(() => matchMedia("(forced-colors: active)").matches)) {
      await page.evaluate((html) => { window.__two.editor.setHtml(html); window.__two.editor.focus(); }, sample);
      const forced = [];
      const ring = async (where) => { const r = await page.evaluate(() => window.__a11y.focusRing()); if (!r.ring) forced.push(`${where}: no ring`); };
      await page.evaluate(() => document.querySelector("#second [data-rte-part=toolbar] [tabindex='0']").focus());
      await key("ArrowRight");
      await ring("button");
      await page.evaluate(() => window.__two.editor.focus());
      await ring("writing area");
      await page.evaluate(() => document.querySelector("#second [data-rte-item=symbols]").focus());
      await key("Enter", 80);
      await ring("menu entry");
      await key("Escape");
      await page.evaluate(() => document.querySelector("#second [data-rte-item=link]").focus());
      await key("Enter", 100);
      await ring("dialog field");
      await key("Escape", 100);
      // Grips and the image handle: inline colors are replaced in forced colors, so they must keep an edge of another color than their fill.
      await page.evaluate(() => { const e = window.__two.editor; e.focus(); const td = window.__a11y.firstText(document.querySelector("#second td")); e.selectDom(td, 1, td, 1); });
      await page.waitForTimeout(100);
      const grip = await page.evaluate(() => { const g = document.querySelector("[data-rte-grip]"); const c = getComputedStyle(g); return [c.backgroundColor, c.borderTopColor]; });
      if (!grip || grip[0] === grip[1]) forced.push(`grip has no edge: ${grip}`);
      check(`${name} (a11y) forced colors: a button, the writing area, a menu entry and a dialog field show a ring, and a table grip keeps an edge`, forced.length === 0, forced);
    }
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
    if (await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      const moving = async () => page.evaluate(() => [...document.querySelectorAll("#root *, #second *, [data-rte-grip], [data-rte-resize-handle], dialog")].filter((e) => window.__a11y.shown(e)).flatMap((e) => {
        const c = getComputedStyle(e);
        const out = [];
        if (c.transitionDuration.split(",").some((d) => Number.parseFloat(d) > 0)) out.push(`${window.__a11y.label(e)} transition ${c.transitionDuration}`);
        if (c.animationName !== "none" && c.animationDuration.split(",").some((d) => Number.parseFloat(d) > 0)) out.push(`${window.__a11y.label(e)} animation ${c.animationName}`);
        if (c.scrollBehavior === "smooth") out.push(`${window.__a11y.label(e)} smooth scrolling`);
        return out;
      }));
      const found = [...(await moving())];
      await page.evaluate(() => document.querySelector("#second [data-rte-item=italic]").focus());
      await key("ArrowRight", 150);
      found.push(...(await moving()));
      await page.evaluate(() => document.querySelector("#second [data-rte-item=table]").click());
      await page.waitForTimeout(80);
      found.push(...(await moving()));
      await key("Escape");
      await page.evaluate(() => { const e = window.__two.editor; e.focus(); const n = window.__a11y.firstText(document.querySelector("#second p")); e.selectDom(n, 0, n, 4); });
      await key("Shift+ArrowRight", 300);
      found.push(...(await moving()));
      await page.evaluate(() => document.querySelector("#second [data-rte-item=link]").click());
      await page.waitForTimeout(100);
      found.push(...(await moving()));
      await key("Escape", 100);
      await page.evaluate((html) => { const e = window.__two.editor; e.setHtml(html); e.focus(); const td = window.__a11y.firstText(document.querySelector("#second td")); e.selectDom(td, 1, td, 1); }, sample);
      await page.waitForTimeout(100);
      const grips = await page.evaluate(() => document.querySelectorAll("[data-rte-grip]").length);
      found.push(...(await moving()));
      await page.evaluate((src) => window.__two.editor.setHtml(`<p>a<img src="${src}" alt="dot" width="80">b</p>`), onePixelPng());
      await page.click("#second [data-rte-part=content] img");
      await page.waitForTimeout(100);
      const handle = await page.evaluate(() => !!document.querySelector("[data-rte-resize-handle]"));
      found.push(...(await moving()));
      if (grips !== 2 || !handle) found.push(`the grips (${grips}) or the handle (${handle}) did not show`);
      check(`${name} (a11y) reduced motion: nothing moves, with the tooltip, a menu, the selection toolbar, a dialog and the grips up`, found.length === 0, [...new Set(found)].slice(0, 20));
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    check(`${name} (a11y) no page errors in the forced colors and motion pass`, t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  // --- 400% zoom: a 320 by 256 window (a 1280 by 1024 screen at 400%), with every surface open in turn; nothing scrolls sideways, nothing is cut off
  for (const [name, type] of engines) {
    const t = await open(type, { viewport: { width: 320, height: 256 } }, "", "ui", helpers);
    const { page } = t;
    const key = async (k, wait = 40) => { await page.keyboard.press(k); await page.waitForTimeout(wait); };
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const outside = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => window.__a11y.shown(e)).filter((e) => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map((e) => `${window.__a11y.label(e)} ${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)}`), sel);
    const problems = [];
    const look = async (what, sel) => { if (await sideways()) problems.push(`${what}: the page scrolls sideways`); for (const o of await outside(sel)) problems.push(`${what}: ${o}`); };
    await page.evaluate((html) => window.__two.editor.setHtml(`${html}<p>https://example.com/a/very/long/address/with/no/spaces/in/it/at/all/that/goes/on/and/on</p>`), sample);
    await page.waitForTimeout(100);
    await look("page", "#second [data-rte-part=toolbar] [data-rte-item], #second [data-rte-part=content] p");
    for (const id of ["text-color", "table", "symbols", "list-style"]) {
      await page.evaluate((i) => document.querySelector(`#second [data-rte-item="${i}"]`).click(), id);
      await page.waitForTimeout(100);
      await look(`${id} menu`, "#second [data-rte-part=menu]:not([hidden])");
      await key("Escape");
    }
    await page.evaluate(() => document.querySelector("#second [data-rte-item=find]").click());
    await page.waitForTimeout(100);
    await look("find bar", "#second [data-rte-part=findbar] *");
    await key("Escape");
    // The tooltip with the longest words.
    const longest = await page.evaluate(() => [...document.querySelectorAll("#second [data-rte-part=toolbar] [data-rte-tip]")].sort((a, b) => b.getAttribute("data-rte-tip").length - a.getAttribute("data-rte-tip").length)[0].getAttribute("data-rte-item"));
    await page.evaluate((i) => document.querySelector(`#second [data-rte-item="${i}"]`).focus(), longest);
    await page.waitForTimeout(150);
    await look(`tooltip of ${longest}`, "#second [data-rte-part=tooltip]");
    if (await page.evaluate(() => { const tip = document.querySelector("#second [data-rte-part=tooltip]"); return !tip.hidden && tip.scrollWidth > tip.clientWidth + 1; })) problems.push("tooltip: its words run out of its box");
    for (const id of ["link", "image", "shortcuts"]) {
      await page.evaluate(() => { const e = window.__two.editor; e.focus(); const n = window.__a11y.firstText(document.querySelector("#second [data-rte-part=content] p")); e.selectDom(n, 0, n, 4); });
      await page.waitForTimeout(80);
      await page.evaluate((i) => document.querySelector(`#second [data-rte-item="${i}"]`).click(), id);
      await page.waitForTimeout(120);
      await look(`${id} dialog`, "#second dialog[open], #second dialog[open] *");
      // Taller than the window is fine as long as it scrolls to its buttons.
      const reach = await page.evaluate(() => { const d = [...document.querySelectorAll("#second dialog")].find((x) => x.open); const r = d.getBoundingClientRect(); const fits = r.top >= -1 && r.bottom <= innerHeight + 1; const scrolls = d.scrollHeight <= d.clientHeight + 1 || ["auto", "scroll"].includes(getComputedStyle(d).overflowY); return fits && scrolls; });
      if (!reach) problems.push(`${id} dialog: taller than the window and does not scroll`);
      await key("Escape", 100);
    }
    await page.evaluate(() => document.querySelector("#second [data-rte-item=source]").click());
    await page.waitForTimeout(100);
    await look("source view", "#second [data-rte-part=source]");
    await page.evaluate(() => document.querySelector("#second [data-rte-item=source]").click());
    await page.waitForTimeout(100);
    await page.evaluate(() => { const e = window.__two.editor; e.focus(); const n = window.__a11y.firstText(document.querySelector("#second [data-rte-part=content] p")); e.selectDom(n, 0, n, 4); });
    await key("Shift+ArrowRight", 300);
    await look("selection toolbar", "#second [data-rte-part=floating]:not([hidden]), #second [data-rte-part=floating]:not([hidden]) *");
    await key("Alt+F10", 80);
    if (!(await page.evaluate(() => window.__a11y.visible()))) problems.push("selection toolbar: the focused control is covered");
    await key("Escape");
    await key("Escape");
    await page.click("#second [data-rte-part=content] p", { button: "right" });
    await page.waitForTimeout(120);
    const menu = await page.evaluate(() => { const m = [...document.querySelectorAll("#second [role=menu]")].find((x) => !x.hidden && window.__a11y.shown(x)); if (!m) return null; const r = m.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, scrolls: m.scrollHeight <= m.clientHeight + 1 || ["auto", "scroll"].includes(getComputedStyle(m).overflowY) }; });
    if (!menu || menu.left < -1 || menu.right > 321 || menu.top < -1 || menu.bottom > 257 || !menu.scrolls) problems.push(`context menu: ${JSON.stringify(menu)}`);
    await key("Escape");
    // Keyboard focus at this size: walk the toolbar and check each control is shown, not under a tooltip or the selection toolbar.
    await page.evaluate(() => document.querySelector("#second [data-rte-part=toolbar] [tabindex='0']").focus());
    for (let i = 0; i < 45; i++) {
      if (!(await page.evaluate(() => window.__a11y.visible()))) problems.push(`toolbar at 320px: ${await page.evaluate(() => document.activeElement.getAttribute("data-rte-item"))} is covered`);
      await key("ArrowRight", 10);
    }
    check(`${name} (a11y) at 320 by 256 (400% zoom) nothing scrolls sideways or is cut off: toolbar, menus, find bar, tooltip, dialogs, source view, selection toolbar, context menu, a long address; no focused control is covered`, problems.length === 0, problems);
    check(`${name} (a11y) no page errors at 320 by 256`, t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  // --- the custom element in a form: reached with Tab from the field before it, left with Tab to the one after, typed into on the way
  for (const [name, type] of engines) {
    const t = await open(type, {}, "", "element");
    const { page } = t;
    await page.evaluate(() => { const i = document.createElement("input"); i.id = "before"; i.setAttribute("aria-label", "before"); document.getElementById("f").prepend(i); i.focus(); });
    const stops = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(20);
      stops.push(await page.evaluate(() => { const a = document.activeElement; return a.closest("rte-editor")?.id ?? a.closest("rte-toolbar") ? (a.closest("rte-editor")?.id ?? "toolbar") : a.id || a.tagName; }));
    }
    check(`${name} (a11y) in a form, Tab goes from the field before through the toolbar and each editor to the reset button`, stops[0] === "toolbar" && stops.indexOf("body") > 0 && stops.indexOf("second") > stops.indexOf("body") && stops.includes("reset"), stops);
    check(`${name} (a11y) no page errors in the form`, t.errors.length === 0, t.errors);
    await t.browser.close();
  }
}
