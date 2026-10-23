// Lets pasted and loaded content carry SVG images, after they are cleaned. Without this plugin SVG images are refused.
import type { Plugin } from "../plugin.ts";
import { sanitizeSvgDataUrl } from "./svg.ts";

export function svg(): Plugin {
  return {
    id: "rathkit.svg",
    api: "1",
    setup(host) {
      host.importOptions({ sanitizeSvg: sanitizeSvgDataUrl });
    },
  };
}
