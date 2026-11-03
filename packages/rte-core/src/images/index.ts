// @rathkit/rte-core/images: the image policy (upload hook, inline size limit, rejections) and helpers for finding and rewriting images.
import { images as engineOnly, type ImagesOptions } from "./plugin.ts";
import type { Plugin } from "../plugin.ts";
import { imagesView } from "./view.ts";

export type { ImagesOptions };
/** The images plugin, with the part that selects and resizes images in a browser. (`./plugin.ts` is the same without it.) */
export const images = (options?: ImagesOptions): Plugin => ({ ...engineOnly(options), view: imagesView });
export { collectImages, dataImageBytes, isDataImage, mapImages, readDataImage, rewriteImages } from "./images.ts";
