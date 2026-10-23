// Reads the markup word processors write for lists (paragraphs with markers, list-definition attributes) as real lists.
import type { Plugin } from "../plugin.ts";
import { wordRecognizer } from "./recognizer.ts";

export function word(): Plugin {
  return {
    id: "rathkit.word",
    api: "1",
    setup(host) {
      host.importOptions({ recognizers: [wordRecognizer] });
    },
  };
}
