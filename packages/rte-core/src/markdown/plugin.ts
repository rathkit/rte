// Markdown paste as a plugin. It acts only on plain text: when the clipboard also carries HTML (a word processor, a web page, a code editor),
// the standard handling reads that instead and this stays out of the way.
import { kindAt, getBlock } from "../path.ts";
import type { Plugin } from "../plugin.ts";
import { parseMarkdown } from "./parse.ts";
import { looksLikeMarkdown } from "./detect.ts";

export interface MarkdownPasteOptions {
  /**
   * `detect` (default): plain text that clearly looks like Markdown is read as Markdown; anything else pastes as typed.
   * `always`: every plain-text paste is read as Markdown. `never`: the plugin does nothing.
   */
  readonly paste?: "detect" | "always" | "never";
  /** URL schemes a link may use besides relative and fragment addresses. Default: http, https, mailto, tel. */
  readonly linkSchemes?: readonly string[];
  /** Largest `data:` image address, in characters. */
  readonly maxDataImageLength?: number;
}

export function markdown(options: MarkdownPasteOptions = {}): Plugin {
  const mode = options.paste ?? "detect";
  return {
    id: "rathkit.markdown",
    api: "1",
    setup(host) {
      if (mode === "never") return;
      host.pasteHandler((data) => {
        if (data.html && data.html.trim() !== "") return undefined;
        const text = data.text;
        if (!text || text.trim() === "") return undefined;
        const { doc, selection } = host.editor.snapshot;
        // Pasting into code stays literal.
        const path = selection.focus.path;
        if (kindAt(doc, path) === "pre" || getBlock(doc, path)?.type === "pre") return undefined;
        if (mode === "detect" && !looksLikeMarkdown(text)) return undefined;
        const blocks = parseMarkdown(text, {
          ...(options.linkSchemes ? { linkSchemes: options.linkSchemes } : {}),
          ...(options.maxDataImageLength !== undefined ? { maxDataImageLength: options.maxDataImageLength } : {}),
          sanitizeSvg: host.editor.importOptions.sanitizeSvg,
        });
        return blocks.length > 0 ? blocks : undefined;
      });
    },
  };
}
