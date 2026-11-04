// The paste pipeline. A paste starts as raw clipboard data and ends as blocks ready to insert.
// Plugins get the raw data first, before anything is sanitized, through the same public hook shape
// the built-in handling uses: a handler either returns blocks or declines by returning undefined.
import { importBlocks, importText, type ImportOptions } from "./import.ts";
import { CONTENT_PROFILES } from "./policy.ts";
import type { Block } from "./model.ts";

export interface ClipboardData {
  readonly html?: string;
  readonly text?: string;
  /** Raw rich text, when the platform provides it. Never required. */
  readonly rtf?: string;
  /** Every format the clipboard offered, for handlers that look at more than the three above. */
  readonly types?: readonly string[];
}

/** Returns blocks to insert, or undefined to let the next handler (and finally the built-in one) try. */
export type PasteHandler = (data: ClipboardData) => readonly Block[] | undefined;

const START = "<!--StartFragment-->";
const END = "<!--EndFragment-->";

/**
 * The part of clipboard HTML between the fragment markers some platforms add. Not used by the built-in
 * handling, because spreadsheets put the markers inside the table, so cutting there loses the table itself.
 * Offered for handlers that know their source.
 */
export function extractFragment(html: string): string {
  const start = html.indexOf(START);
  const end = html.lastIndexOf(END);
  return start !== -1 && end > start ? html.slice(start + START.length, end) : html;
}

/** One copied spreadsheet cell arrives as a one-cell table. It pastes as inline text instead. */
function unwrapSingleCell(blocks: Block[]): Block[] {
  const only = blocks.length === 1 ? blocks[0] : undefined;
  if (only?.type !== "table" || only.rows.length !== 1 || only.rows[0]?.length !== 1) return blocks;
  const cell = only.rows[0]?.[0];
  if (!cell || cell.colspan !== 1 || cell.rowspan !== 1) return blocks;
  return [...cell.blocks];
}

/** Built-in handling: standard HTML if there is any, otherwise plain text. */
export function defaultPaste(data: ClipboardData, importOptions: ImportOptions = {}): Block[] {
  if (data.html && data.html.trim() !== "") {
    const blocks = importBlocks(data.html, { ...importOptions, styles: "semantic" });
    if (blocks.length > 0) return unwrapSingleCell(blocks);
  }
  const text = data.text ?? "";
  const max = importOptions.maxInputLength ?? CONTENT_PROFILES.standard.maxInputLength;
  if (text.length > max) {
    importOptions.onLimit?.({ limit: "maxInputLength", max, length: text.length });
    return [];
  }
  return importText(text);
}

export function pasteBlocks(data: ClipboardData, handlers: readonly PasteHandler[] = [], importOptions: ImportOptions = {}): readonly Block[] {
  for (const handler of handlers) {
    const result = handler(data);
    if (result) return result;
  }
  return defaultPaste(data, importOptions);
}
