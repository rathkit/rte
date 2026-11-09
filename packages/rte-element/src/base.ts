// On a server there is no HTMLElement, so the class then extends a plain class: importing this module works there, and `define` does nothing.
export const ElementBase = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;
