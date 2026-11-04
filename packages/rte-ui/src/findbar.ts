// The find and replace bar: an input for what to find, one for what to put instead, and buttons. It reads the search from the editor's
// `find.set` command and drives the `find.*` commands, so it holds no search logic of its own. Matches are painted with the page's
// highlight registry where the browser has one (nothing in the document changes), and the match being looked at is the selection.
import type { FindInfo } from "@rathkit/rte-core/find";
import type { UiEditor } from "./types.ts";
import { setIcon } from "./icon.ts";

export interface FindBarOptions {
  readonly editor: UiEditor & { rangeFor?(from: { path: number[]; offset: number }, to: { path: number[]; offset: number }): Range | null };
  /** Makes an element a named part of the interface. */
  readonly part: <E extends HTMLElement>(el: E, name: string) => E;
  readonly message: (key: string, fallback?: string, values?: Record<string, string>) => string;
  readonly icon: (name: string) => string | (() => Node) | undefined;
  readonly announce: (message: string) => void;
}

export interface FindBar {
  readonly element: HTMLElement;
  /** Words may have changed (a different language, say): write them again. */
  refresh(): void;
  destroy(): void;
}

/** A page-wide highlight registry, where the browser has one. */
interface Highlights { set(name: string, highlight: unknown): void; delete(name: string): void }
const registry = (): Highlights | undefined => (globalThis as { CSS?: { highlights?: Highlights } }).CSS?.highlights;
const HighlightCtor = (): (new (...ranges: Range[]) => unknown) | undefined => (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;

/** Matches painted at most this many at a time: a search for "e" in a long document should not make a million ranges. */
const MOST_PAINTED = 2000;

export function createFindBar(options: FindBarOptions): FindBar {
  const { editor, part, message } = options;
  let counter = 0;
  const bar = part(document.createElement("div"), "findbar");
  bar.setAttribute("role", "search");
  bar.hidden = true;

  const field = (label: string, name: string): { wrap: HTMLElement; input: HTMLInputElement; text: HTMLLabelElement } => {
    const id = `rte-find-${++counter}`;
    const wrap = part(document.createElement("div"), "find-row");
    const text = part(document.createElement("label"), "find-label");
    text.htmlFor = id;
    text.textContent = label;
    const input = part(document.createElement("input"), "find-field");
    input.id = id;
    input.type = "text";
    input.name = name;
    input.autocomplete = "off";
    input.spellcheck = false;
    wrap.append(text, input);
    return { wrap, input, text };
  };
  const iconButton = (name: string, label: string): HTMLButtonElement => {
    const b = part(document.createElement("button"), "button");
    b.type = "button";
    const i = part(document.createElement("span"), "icon");
    i.setAttribute("aria-hidden", "true");
    if (setIcon(i, options.icon(name))) b.appendChild(i);
    else b.textContent = label;
    b.setAttribute("aria-label", label);
    b.setAttribute("data-rte-tip", label);
    return b;
  };
  const textButton = (label: string): HTMLButtonElement => {
    const b = part(document.createElement("button"), "action");
    b.type = "button";
    b.textContent = label;
    return b;
  };

  const find = field("", "find");
  const replace = field("", "replace");
  const count = part(document.createElement("span"), "find-count");
  const previous = iconButton("chevron-up", "");
  const next = iconButton("chevron-down", "");
  const matchCase = part(document.createElement("button"), "button");
  matchCase.type = "button";
  matchCase.textContent = "Aa";
  const wholeWord = part(document.createElement("button"), "button");
  wholeWord.type = "button";
  wholeWord.textContent = "ab";
  const replaceOne = textButton("");
  const replaceAll = textButton("");
  const close = iconButton("close", "");
  const first = part(document.createElement("div"), "find-line");
  first.append(find.wrap, previous, next, matchCase, wholeWord, count, close);
  const second = part(document.createElement("div"), "find-line");
  second.append(replace.wrap, replaceOne, replaceAll);
  bar.append(first, second);

  const words = (): void => {
    find.text.textContent = message("find.find");
    replace.text.textContent = message("find.replaceWith");
    for (const [el, key] of [[previous, "find.previous"], [next, "find.next"], [close, "find.close"], [matchCase, "find.matchCase"], [wholeWord, "find.wholeWord"]] as const) {
      el.setAttribute("aria-label", message(key));
      el.setAttribute("data-rte-tip", message(key));
    }
    replaceOne.textContent = message("find.replace");
    replaceAll.textContent = message("find.replaceAll");
  };
  words();

  const info = (): FindInfo => editor.commands.state("find.set").value as FindInfo;
  let lastOpens = -1;
  let lastCount = "";
  let announceTimer: ReturnType<typeof setTimeout> | undefined;

  const paint = (state: FindInfo): void => {
    const highlights = registry();
    const Highlight = HighlightCtor();
    if (!highlights || !Highlight || !editor.rangeFor) return;
    if (!state.open || state.matches.length === 0) {
      highlights.delete("rte-find");
      highlights.delete("rte-find-current");
      return;
    }
    const ranges: Range[] = [];
    let current: Range | undefined;
    state.matches.slice(0, MOST_PAINTED).forEach((m, i) => {
      const range = editor.rangeFor?.({ path: [...m.path], offset: m.from }, { path: [...m.path], offset: m.to });
      if (!range) return;
      if (i === state.index) current = range;
      else ranges.push(range);
    });
    highlights.set("rte-find", new Highlight(...ranges));
    if (current) highlights.set("rte-find-current", new Highlight(current));
    else highlights.delete("rte-find-current");
  };

  const render = (): void => {
    const state = info();
    bar.hidden = !state.open;
    if (!state.open) {
      paint(state);
      lastOpens = state.opens;
      return;
    }
    if (state.query !== find.input.value) find.input.value = state.query;
    matchCase.setAttribute("aria-pressed", String(state.matchCase));
    wholeWord.setAttribute("aria-pressed", String(state.wholeWord));
    const text = state.query === "" ? "" : state.matches.length === 0 ? message("find.none")
      : state.index >= 0 ? message("find.count", "", { current: String(state.index + 1), total: String(state.matches.length) })
        : message("find.total", "", { total: String(state.matches.length) });
    count.textContent = text;
    // Said once typing pauses, not on every key, and only when it differs from what was said last.
    if (text !== lastCount) {
      lastCount = text;
      if (announceTimer) clearTimeout(announceTimer);
      if (text !== "") announceTimer = setTimeout(() => options.announce(text), 500);
    }
    for (const b of [previous, next, replaceOne, replaceAll]) b.setAttribute("aria-disabled", String(state.matches.length === 0));
    paint(state);
    // Asked to open (the key, the button): the focus goes to the search box, with what was there selected for typing over.
    if (state.opens !== lastOpens) {
      lastOpens = state.opens;
      find.input.focus();
      find.input.select();
    }
    // The match being looked at is brought into view.
    if (state.index >= 0 && editor.rangeFor) {
      const m = state.matches[state.index];
      const at = m && editor.rangeFor({ path: [...m.path], offset: m.from }, { path: [...m.path], offset: m.to });
      (at?.startContainer instanceof Element ? at.startContainer : at?.startContainer.parentElement)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  };

  const run = (name: string, arg?: unknown): void => { editor.commands.run(name, arg); };
  const onFind = (): void => run("find.set", { query: find.input.value });
  find.input.addEventListener("input", onFind);
  find.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); run(e.shiftKey ? "find.previous" : "find.next"); }
  });
  replace.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); run("find.replace", { with: replace.input.value }); }
  });
  bar.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); run("find.close"); }
  });
  previous.addEventListener("click", () => run("find.previous"));
  next.addEventListener("click", () => run("find.next"));
  matchCase.addEventListener("click", () => run("find.set", { matchCase: matchCase.getAttribute("aria-pressed") !== "true" }));
  wholeWord.addEventListener("click", () => run("find.set", { wholeWord: wholeWord.getAttribute("aria-pressed") !== "true" }));
  replaceOne.addEventListener("click", () => run("find.replace", { with: replace.input.value }));
  replaceAll.addEventListener("click", () => run("find.replaceAll", { with: replace.input.value }));
  close.addEventListener("click", () => run("find.close"));

  const stop = editor.commands.subscribe("find.set", render);
  // The matches are repainted when the document changes under an open search; the command's state moves with the document.
  render();
  return {
    element: bar,
    refresh() { words(); render(); },
    destroy() {
      stop();
      if (announceTimer) clearTimeout(announceTimer);
      const highlights = registry();
      highlights?.delete("rte-find");
      highlights?.delete("rte-find-current");
      bar.remove();
    },
  };
}
