import type { Engine } from "@rathkit/rte-core";

/**
 * What the interaction rules need of an editor. The browser `Editor` fits as it is. A bare engine fits too, once it is given
 * somewhere to send the keyboard focus.
 */
export interface HeadlessEditor {
  readonly commands: Engine["commands"];
  readonly keymap: Engine["keymap"];
  readonly ui: Engine["ui"];
  /** Puts the keyboard focus back in the editing surface. */
  focus(): void;
}

export type Unsubscribe = () => void;
