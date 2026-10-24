// Counting what is in a document, for a status line. A word is a run of letters, marks and digits (with apostrophes and hyphens inside it
// counting as part of it); text is counted as written, so a line break or an image is not a character.
import { inlineText, type Doc } from "./model.ts";
import { containerPaths, getContent, type Selection } from "./path.ts";
import { selectedText } from "./edit.ts";

export interface Counts {
  readonly words: number;
  /** Characters including spaces. */
  readonly characters: number;
}

const WORD = /[\p{L}\p{M}\p{N}]+(?:['’\-‑][\p{L}\p{M}\p{N}]+)*/gu;

/** The words and characters in a piece of text. */
export function countText(text: string): Counts {
  const clean = text.replace(/￼/g, "").replace(/\n/g, " ");
  return { words: (clean.match(WORD) ?? []).length, characters: [...clean.replace(/\s+$/g, "").replace(/^\s+/g, "")].length };
}

/** The words and characters in the whole document. Containers (paragraphs, list items, cells) are counted as separate runs of text. */
export function countDocument(doc: Doc): Counts {
  let words = 0;
  let characters = 0;
  for (const path of containerPaths(doc)) {
    const c = countText(inlineText(getContent(doc, path)));
    words += c.words;
    characters += c.characters;
  }
  return { words, characters };
}

/** The words and characters in the selected text; zero for a caret. */
export function countSelection(doc: Doc, sel: Selection): Counts {
  return countText(selectedText(doc, sel));
}

/** How much text the document holds, counting every character (spaces and line breaks too) and an image as one. Used for length limits. */
export function textLength(doc: Doc): number {
  let total = 0;
  for (const path of containerPaths(doc)) total += inlineText(getContent(doc, path)).length;
  return total;
}
