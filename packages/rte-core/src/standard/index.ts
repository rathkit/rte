// @rathkit/rte-core/standard: the editor with the free standard plugins already in it (lists, word-processor lists, SVG
// images, the image policy). This is the one to use unless you want to pick the parts yourself.
import { autoformat, type AutoformatOptions } from "../autoformat/plugin.ts";
import { Editor, type EditorOptions } from "../dom/view.ts";
import { find } from "../find/plugin.ts";
import { images, type ImagesOptions } from "../images/plugin.ts";
import { lists, type ListsOptions } from "../lists/plugin.ts";
import type { Plugin } from "../plugin.ts";
import { svg } from "../svg/plugin.ts";
import { tables, type TablesOptions } from "../tables/plugin.ts";
import { word } from "../word/plugin.ts";

/** Which standard plugins to use, and how. */
export interface StandardPluginOptions extends ImagesOptions {
  /** Options for lists, or `false` to leave lists out. */
  readonly lists?: ListsOptions | false;
  /** Options for the typed shortcuts (headings, quotes, bold and the rest, links), or `false` to leave them out. */
  readonly autoformat?: AutoformatOptions | false;
  /** `false` to leave find and replace out. */
  readonly find?: false;
  /** Options for tables, or `false` to leave tables out. */
  readonly tables?: TablesOptions | false;
  /** More plugins, added after the standard ones. */
  readonly plugins?: readonly Plugin[];
}

export interface StandardOptions extends Omit<EditorOptions, "plugins">, StandardPluginOptions {}

/** The standard plugins, for hosts that build their own editor but want the usual parts. */
export function standardPlugins(options: StandardPluginOptions = {}): Plugin[] {
  const { uploadImage, maxInlineImageBytes, maxImageFileBytes, onImageRejected } = options;
  return [
    ...(options.lists === false ? [] : [lists(options.lists)]),
    ...(options.tables === false ? [] : [tables(options.tables)]),
    ...(options.find === false ? [] : [find()]),
    ...(options.autoformat === false ? [] : [autoformat(options.autoformat)]),
    word(),
    svg(),
    images({
      ...(uploadImage ? { uploadImage } : {}),
      ...(maxInlineImageBytes !== undefined ? { maxInlineImageBytes } : {}),
      ...(maxImageFileBytes !== undefined ? { maxImageFileBytes } : {}),
      ...(onImageRejected ? { onImageRejected } : {}),
    }),
    ...(options.plugins ?? []),
  ];
}

export function createEditor(options: StandardOptions): Editor {
  const { lists: _lists, tables: _tables, find: _find, autoformat: _autoformat, plugins: _plugins, uploadImage: _u, maxInlineImageBytes: _m, maxImageFileBytes: _f, onImageRejected: _r, ...editorOptions } = options;
  void [_lists, _tables, _find, _autoformat, _plugins, _u, _m, _f, _r];
  return new Editor({ ...editorOptions, plugins: standardPlugins(options) });
}

export { Editor, type EditorOptions };
