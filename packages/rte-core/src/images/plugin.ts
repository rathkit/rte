// The image policy: how pasted and dropped images get into a document without making it huge or unsafe. Raster images are
// uploaded through a function the host provides, or embedded when small enough; larger ones are left out and reported. The
// bytes of a file must match the type it claims. (SVG is cleaned by the svg plugin, if the editor has it.)
import { encodeBase64 } from "../base64.ts";
import { checkImageSrc } from "../import.ts";
import type { Block, Inline } from "../model.ts";
import type { FileLike, Plugin } from "../plugin.ts";
import { collectImages, isDataImage, mapImages, readDataImage, rewriteImages } from "./images.ts";

export interface ImagesOptions {
  /**
   * Stores an image on the host's own server and returns its address. When set, pasted and dropped raster images are uploaded
   * instead of being embedded in the document, so documents stay small. Nothing is sent anywhere without it.
   */
  readonly uploadImage?: (file: Blob, info: { readonly name: string; readonly type: string; readonly size: number }) => Promise<string>;
  /** Largest raster image, in bytes, that is embedded when there is no `uploadImage`. Default 512 KB. */
  readonly maxInlineImageBytes?: number;
  /** Largest image file that is read at all, in bytes. Default 20 MB. */
  readonly maxImageFileBytes?: number;
  /** Called when an image is left out, with the reason, so the host can tell the person. */
  readonly onImageRejected?: (info: { readonly reason: "too-large" | "unsupported" | "upload-failed"; readonly type: string; readonly size: number }) => void;
}

export function images(options: ImagesOptions = {}): Plugin {
  const maxInline = options.maxInlineImageBytes ?? 512 * 1024;
  const maxFile = options.maxImageFileBytes ?? 20_000_000;
  const upload = options.uploadImage;
  const rejected = options.onImageRejected;

  return {
    id: "rathkit.images",
    api: "1",
    setup(host) {
      const sanitizeSvg = (): ((dataUrl: string) => string | undefined) | undefined => host.editor.importOptions.sanitizeSvg;
      const reject = (reason: "too-large" | "unsupported" | "upload-failed", type: string, size: number): undefined => {
        rejected?.({ reason, type, size });
        return undefined;
      };

      /** Uploads a file or embedded image and returns its address, checked, or undefined (and reports why). */
      const uploadAddress = async (file: Blob): Promise<string | undefined> => {
        try {
          const url = await upload?.(file, { name: (file as { name?: string }).name ?? "image", type: file.type, size: file.size });
          const checked = url ? checkImageSrc(url) : undefined;
          return checked ?? reject("unsupported", file.type, file.size);
        } catch {
          return reject("upload-failed", file.type, file.size);
        }
      };

      // Pasted content: images that arrive inside it as data addresses are uploaded, or left out when too big to embed.
      host.pasteTransform((blocks) => {
        const embedded = collectImages(blocks).filter((image) => isDataImage(image) && !/^data:image\/svg/i.test(image.src));
        if (embedded.length === 0) return blocks;
        if (upload) {
          return rewriteImages(blocks, async (image) => {
            const info = readDataImage(image.src);
            if (!info) return image;
            const src = await uploadAddress(new Blob([info.bytes as never], { type: info.type }));
            return src ? { ...image, src } : undefined;
          });
        }
        return mapImages(blocks, (image) => {
          const info = readDataImage(image.src);
          if (!info || info.bytes.length <= maxInline) return image;
          return reject("too-large", info.type, info.bytes.length);
        });
      });

      // Files: SVG is cleaned and embedded; raster images are uploaded, or embedded if small. The bytes must match the type.
      const imageFromFile = async (file: FileLike): Promise<Block | undefined> => {
        if (!file.type.startsWith("image/")) return undefined;
        if (file.size > maxFile) return reject("too-large", file.type, file.size);
        if (file.type === "image/svg+xml") {
          const clean = sanitizeSvg();
          const bytes = new TextEncoder().encode(await file.text());
          const src = clean?.(`data:image/svg+xml;base64,${encodeBase64(bytes)}`);
          return src ? { type: "p", content: [{ type: "image", src }] } : reject("unsupported", file.type, file.size);
        }
        // The first bytes must match the type the file claims before anything else is done with it.
        const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
        if (!checkImageSrc(`data:${file.type};base64,${encodeBase64(head)}`)) return reject("unsupported", file.type, file.size);
        if (upload) {
          const src = await uploadAddress(file as unknown as Blob);
          return src ? { type: "p", content: [{ type: "image", src }] } : undefined;
        }
        if (file.size > maxInline) return reject("too-large", file.type, file.size);
        const src = checkImageSrc(`data:${file.type};base64,${encodeBase64(new Uint8Array(await file.arrayBuffer()))}`);
        return src ? { type: "p", content: [{ type: "image", src }] } : reject("unsupported", file.type, file.size);
      };
      // Inserting an image by address: the same check as anything that arrives by paste, so a script address or a bad data address is refused.
      host.command({
        name: "image.insert", label: "Image",
        run: (ctx, arg: { readonly src?: string; readonly alt?: string } | undefined) => {
          const src = typeof arg?.src === "string" ? host.ops.checkImageSrc(arg.src.trim(), undefined, sanitizeSvg()) : undefined;
          if (!src) return false;
          const alt = typeof arg?.alt === "string" && arg.alt.trim() !== "" ? arg.alt.trim() : undefined;
          const image: Inline = { type: "image", src, ...(alt !== undefined ? { alt } : {}) };
          const { ops } = host;
          return ctx.apply("image", (doc, sel) => {
            if (ops.kindAt(doc, ops.isCollapsed(sel) ? sel.focus.path : sel.anchor.path) === "pre") return { doc, selection: sel };
            const cleared = ops.deleteSelection(doc, sel);
            const pos = cleared.selection.anchor;
            if (ops.kindAt(cleared.doc, pos.path) === "pre") return { doc, selection: sel };
            const content = ops.getContent(cleared.doc, pos.path);
            const next = ops.normalizeInline([...ops.sliceInline(content, 0, pos.offset), image, ...ops.sliceInline(content, pos.offset)]);
            return { doc: ops.setContent(cleared.doc, pos.path, next), selection: ops.caret({ path: pos.path, offset: pos.offset + 1 }) };
          });
        },
        state: (snap) => ({ enabled: host.ops.kindAt(snap.doc, snap.selection.focus.path) !== "pre" }),
      });
      host.ui("toolbar.main", {
        kind: "dialog", id: "image", command: "image.insert", label: "Image", icon: "image", group: "insert", order: 3,
        fields: [
          { name: "src", type: "url", label: "Address", required: true },
          { name: "alt", type: "text", label: "Description for people who cannot see the image" },
        ],
      });
      host.fileHandler(async (files) => {
        const blocks = (await Promise.all(files.map(imageFromFile))).filter((b): b is Block => b !== undefined);
        return blocks.length > 0 ? blocks : undefined;
      });
    },
  };
}
