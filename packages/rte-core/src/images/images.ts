// Helpers for the images inside blocks: finding them, measuring inline ones, and rewriting them. DOM-free.
import type { Block, Image, Inline, List, ListItem } from "../model.ts";
import { decodeBase64 } from "../base64.ts";
import { asChildren } from "../path.ts";

/** The decoded size, in bytes, of a base64 data address, without decoding it. Zero for anything else. */
export function dataImageBytes(src: string): number {
  const comma = src.indexOf(",");
  if (!/^data:/i.test(src) || comma === -1 || !/;base64$/i.test(src.slice(0, comma))) return 0;
  const body = src.length - comma - 1;
  const padding = src.endsWith("==") ? 2 : src.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((body * 3) / 4) - padding);
}

/** The type and bytes of a base64 image data address, or undefined. */
export function readDataImage(src: string): { type: string; bytes: Uint8Array } | undefined {
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([\s\S]*)$/i.exec(src);
  const bytes = match ? decodeBase64(match[2] as string) : undefined;
  return match && bytes ? { type: (match[1] as string).toLowerCase(), bytes } : undefined;
}

export const isDataImage = (image: Image): boolean => /^data:/i.test(image.src);

/**
 * Rewrites every image in the blocks: return a new image to replace one, or undefined to remove it. A paragraph, heading
 * or list item that held nothing but removed images goes with them, so removing an image leaves no empty block behind.
 */
export function mapImages(blocks: readonly Block[], fn: (image: Image) => Image | undefined): Block[] {
  const inline = (content: readonly Inline[]): { content: Inline[]; emptied: boolean } => {
    const out = content.flatMap((node): Inline[] => {
      if (node.type !== "image") return [node];
      const next = fn(node);
      return next ? [next] : [];
    });
    return { content: out, emptied: out.length === 0 && content.some((node) => node.type === "image") };
  };
  const list = (l: List): List | undefined => {
    const items = l.items.flatMap((item): ListItem[] => {
      const { content, emptied } = inline(item.content);
      const children = asChildren(walk(item.children));
      return emptied && children.length === 0 ? [] : [{ ...item, content, children }];
    });
    return items.length > 0 || l.items.length === 0 ? { ...l, items } : undefined;
  };
  const walk = (bs: readonly Block[]): Block[] => bs.flatMap((block): Block[] => {
    switch (block.type) {
      case "p": case "h": {
        const { content, emptied } = inline(block.content);
        return emptied ? [] : [{ ...block, content }];
      }
      case "ul": case "ol": {
        const next = list(block);
        return next ? [next] : [];
      }
      case "dl": {
        const entries = block.entries.flatMap((entry) => {
          const { content, emptied } = inline(entry.content);
          return emptied ? [] : [{ ...entry, content }];
        });
        return entries.length > 0 ? [{ ...block, entries }] : [];
      }
      case "quote": {
        const inner = walk(block.blocks);
        return inner.length > 0 ? [{ ...block, blocks: inner }] : [];
      }
      case "table": return [{ ...block, rows: block.rows.map((row) => row.map((cell) => {
        const inner = walk(cell.blocks);
        return { ...cell, blocks: inner.length > 0 ? inner : [{ type: "p", content: [] } as Block] };
      })) }];
      default: return [block];
    }
  });
  return walk(blocks);
}

/** Like `mapImages`, for a rewrite that takes time (an upload). All images are handled at the same time. */
export async function rewriteImages(blocks: readonly Block[], fn: (image: Image) => Promise<Image | undefined>): Promise<Block[]> {
  const images = collectImages(blocks);
  const results = new Map<Image, Image | undefined>();
  await Promise.all(images.map(async (image) => { results.set(image, await fn(image)); }));
  return mapImages(blocks, (image) => results.get(image));
}

/** Every image in the blocks, in reading order. */
export function collectImages(blocks: readonly Block[]): Image[] {
  const found: Image[] = [];
  const inline = (content: readonly Inline[]): void => { for (const node of content) if (node.type === "image") found.push(node); };
  const list = (l: List): void => l.items.forEach((item) => { inline(item.content); walk(item.children); });
  const walk = (bs: readonly Block[]): void => {
    for (const block of bs) {
      if (block.type === "p" || block.type === "h") inline(block.content);
      else if (block.type === "ul" || block.type === "ol") list(block);
      else if (block.type === "dl") block.entries.forEach((entry) => inline(entry.content));
      else if (block.type === "quote") walk(block.blocks);
      else if (block.type === "table") block.rows.forEach((row) => row.forEach((cell) => walk(cell.blocks)));
    }
  };
  walk(blocks);
  return found;
}
