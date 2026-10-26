// Typed shortcuts as a plugin. It uses only what any plugin gets from the host.
import type { Plugin } from "../plugin.ts";
import { addressShortcut, blockShortcut, spanShortcut } from "./autoformat.ts";

export interface AutoformatOptions {
  /** `# ` heading, `> ` quote, three backticks a code block, three dashes a rule. Default on. */
  readonly blocks?: boolean;
  /** `**bold**`, `*italic*`, `_italic_`, `~~strike~~`, `` `code` ``. Default on. */
  readonly spans?: boolean;
  /** A web address followed by a space becomes a link. Default on. */
  readonly links?: boolean;
}

export function autoformat(options: AutoformatOptions = {}): Plugin {
  return {
    id: "rathkit.autoformat",
    api: "1",
    setup(host) {
      if (options.blocks ?? true) host.textTrigger(blockShortcut);
      if (options.spans ?? true) host.textTrigger(spanShortcut);
      if (options.links ?? true) host.textTrigger(addressShortcut);
    },
  };
}
