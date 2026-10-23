// Puts an icon into an element. A string is parsed once by the browser's own parser inside a <template>, so nothing in it runs or loads;
// even so it must be one SVG and nothing else. A function makes the node itself. Icons are the host's markup: their trust is the host's call.
const cache = new Map<string, DocumentFragment | null>();

function parse(svg: string): DocumentFragment | null {
  const hit = cache.get(svg);
  if (hit !== undefined) return hit;
  const template = document.createElement("template");
  template.innerHTML = svg;
  const ok = template.content.childElementCount === 1 && template.content.firstElementChild?.localName === "svg" && !template.content.querySelector("script, foreignObject, [onload], [onclick], [onerror]");
  const fragment = ok ? template.content : null;
  cache.set(svg, fragment);
  return fragment;
}

/** True when something was drawn. */
export function setIcon(target: HTMLElement, source: string | (() => Node) | undefined): boolean {
  if (source === undefined) {
    target.replaceChildren();
    return false;
  }
  const node = typeof source === "function" ? source() : parse(source)?.cloneNode(true);
  if (!node) {
    target.replaceChildren();
    return false;
  }
  target.replaceChildren(node);
  return true;
}
