// Markdown paste as a plugin. It acts only on plain text: when the clipboard also carries HTML (a word processor, a web page, a code editor),
// the standard handling reads that instead and this stays out of the way.
import { kindAt, getBlock } from "../path.ts";
import type { Plugin } from "../plugin.ts";
import { exportMarkdown } from "./export.ts";
import { parseMarkdown } from "./parse.ts";
import { looksLikeMarkdown } from "./detect.ts";

export interface MarkdownPasteOptions {
  /**
   * `detect` (default): plain text that clearly looks like Markdown is read as Markdown; anything else pastes as typed.
   * `always`: every plain-text paste is read as Markdown. `never`: the plugin does nothing.
   */
  readonly paste?: "detect" | "always" | "never";
  /**
   * What copy, cut and drag write besides the editor's HTML and plain text. `"markdown"` (default) adds the selection as
   * `text/markdown`; `"plain"` also makes the plain text Markdown, for pasting into a text field; `"off"` adds nothing.
   */
  readonly copy?: "markdown" | "plain" | "off";
  /** Write underline, superscript and subscript as inline HTML when copying (see `MarkdownExportOptions`). Default false. */
  readonly inlineHtml?: boolean;
  /** URL schemes a link may use besides relative and fragment addresses. Default: http, https, mailto, tel. */
  readonly linkSchemes?: readonly string[];
  /** Largest `data:` image address, in characters. */
  readonly maxDataImageLength?: number;
}

export function markdown(options: MarkdownPasteOptions = {}): Plugin {
  const mode = options.paste ?? "detect";
  const copy = options.copy ?? "markdown";
  return {
    id: "rathkit.markdown",
    api: "1",
    setup(host) {
      if (copy !== "off") {
        host.copyFormat((blocks) => {
          const text = exportMarkdown({ blocks }, { inlineHtml: options.inlineHtml === true });
          return copy === "plain" ? { "text/markdown": text, "text/plain": text } : { "text/markdown": text };
        });
      }
      // Copies the selection as Markdown text (the whole document when nothing is selected) with the clipboard API, for a menu item or a key.
      host.command<void, never>({
        name: "markdown.copy", label: "Copy as Markdown", mutates: false,
        run: (ctx) => {
          const clipboard = (globalThis as { navigator?: { clipboard?: { writeText(text: string): Promise<void> } } }).navigator?.clipboard;
          if (!clipboard) return false;
          const { doc, selection } = ctx.snapshot;
          const blocks = host.ops.isCollapsed(selection) ? doc.blocks : host.ops.extractSelection(doc, selection);
          clipboard.writeText(exportMarkdown({ blocks }, { inlineHtml: options.inlineHtml === true })).catch((error: unknown) => host.editor.warn(`Copy as Markdown failed: ${String(error)}`));
          return true;
        },
      });
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
