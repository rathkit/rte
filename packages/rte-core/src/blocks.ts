// Block-level commands that are not about lists: paragraph and heading type, and alignment.
import type { Align, Block, Doc, Inline } from "./model.ts";
import { fixup, getBlock, kindAt, mapBlockList, selectedContainers, type EditResult, type Path, type Selection } from "./path.ts";

export type BlockKind = { readonly type: "p" } | { readonly type: "h"; readonly level: 1 | 2 | 3 | 4 | 5 | 6 };

const sameKind = (block: Block, kind: BlockKind): boolean =>
  block.type === "p" ? kind.type === "p" : block.type === "h" && kind.type === "h" && block.level === kind.level;

function textOf(block: Block): readonly Inline[] | undefined {
  if (block.type === "p" || block.type === "h") return block.content;
  if (block.type === "pre") return block.text === "" ? [] : [{ type: "text", text: block.text, marks: [] }];
  return undefined;
}

/** The paragraphs, headings and code blocks a selection touches, which are the blocks this can retype. */
function retypable(doc: Doc, sel: Selection): Path[] {
  return selectedContainers(doc, sel).filter((p) => {
    const kind = kindAt(doc, p);
    return kind === "p" || kind === "h" || kind === "pre";
  });
}

/** The kind of the block where the selection starts: "p", "h" with a level, "pre", or a list item, entry and so on. */
export function blockKindAt(doc: Doc, sel: Selection): { type: string; level?: number } | undefined {
  const first = selectedContainers(doc, sel)[0];
  if (!first) return undefined;
  const block = getBlock(doc, first);
  if (block?.type === "h") return { type: "h", level: block.level };
  const kind = kindAt(doc, first);
  return kind ? { type: kind } : undefined;
}

/**
 * Makes every selected paragraph, heading or code block the given kind. When the first one already is that kind, every
 * selected block goes back to a paragraph, so the same command toggles. List items, entries and tables are left alone.
 * Marks inside a code block do not exist, so a code block turned into text has none.
 */
export function setBlockType(doc: Doc, sel: Selection, kind: BlockKind): EditResult {
  const paths = retypable(doc, sel);
  if (paths.length === 0) return { doc, selection: sel };
  const firstBlock = getBlock(doc, paths[0] as Path);
  const target: BlockKind = firstBlock && sameKind(firstBlock, kind) ? { type: "p" } : kind;
  let next = doc;
  for (const path of paths) {
    next = fixup(mapBlockList(next, path, (blocks, index) => {
      const block = blocks[index] as Block;
      const content = textOf(block);
      if (!content) return blocks;
      const align = block.type === "p" || block.type === "h" ? block.align : undefined;
      const replacement: Block = target.type === "p"
        ? { type: "p", content, ...(align ? { align } : {}) }
        : { type: "h", level: target.level, content, ...(align ? { align } : {}) };
      return [...blocks.slice(0, index), replacement, ...blocks.slice(index + 1)];
    }));
  }
  return { doc: next, selection: sel };
}

/** The alignment of the block where the selection starts. Undefined means the default. */
export function alignAt(doc: Doc, sel: Selection): Align | undefined {
  const first = selectedContainers(doc, sel)[0];
  const block = first ? getBlock(doc, first) : undefined;
  return block?.type === "p" || block?.type === "h" ? block.align : undefined;
}

/** Aligns every selected paragraph and heading. `left` is the default and is stored as no alignment at all. */
export function setAlign(doc: Doc, sel: Selection, align: Align): EditResult {
  const paths = retypable(doc, sel).filter((p) => {
    const block = getBlock(doc, p);
    return block?.type === "p" || block?.type === "h";
  });
  if (paths.length === 0) return { doc, selection: sel };
  let next = doc;
  for (const path of paths) {
    next = mapBlockList(next, path, (blocks, index) => {
      const block = blocks[index] as Block;
      if (block.type !== "p" && block.type !== "h") return blocks;
      const { align: _old, ...rest } = block;
      void _old;
      const updated = (align === "left" ? rest : { ...rest, align }) as Block;
      return [...blocks.slice(0, index), updated, ...blocks.slice(index + 1)];
    });
  }
  return { doc: next, selection: sel };
}

