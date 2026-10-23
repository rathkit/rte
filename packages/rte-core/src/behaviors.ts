// Hooks that let a plugin decide how editing works inside the containers it owns (list items, definition entries), and react to
// typed text. EXPERIMENTAL, like the rest of the plugin API. The editor works without any of them: see the defaults in edit.ts.
import type { Block, Doc, Inline } from "./model.ts";
import type { EditResult, Pos, Selection } from "./path.ts";

/** The kinds of container a plugin can own. Paragraphs, headings and code blocks belong to the editor itself. */
export type ContainerKind = "li" | "dt" | "dd";

export interface ContainerBehavior {
  /** Enter in a container of this kind, with the selection already removed. Undefined: use the default (a line break). */
  split?(doc: Doc, pos: Pos): EditResult | undefined;
  /** Backspace at the very start of a container of this kind. Undefined: use the default (join with the one before). */
  backspaceAtStart?(doc: Doc, pos: Pos): EditResult | undefined;
  /** Several blocks pasted into a container of this kind, with the text before and after the caret. Undefined: use the default. */
  insertBlocks?(doc: Doc, pos: Pos, blocks: readonly Block[], before: Inline[], after: Inline[]): EditResult | undefined;
}

export type Behaviors = Partial<Record<ContainerKind, ContainerBehavior>>;

/** Runs when text is typed, before it is inserted. Return a result to take over (the typed text is then not inserted). */
export type TextTrigger = (doc: Doc, sel: Selection, typed: string) => EditResult | undefined;
