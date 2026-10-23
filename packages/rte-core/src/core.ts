// Creates an engine with the standard commands and keys, ready to use without any DOM.
import { coreCommands, coreKeys, listKeys, listMoveCommands } from "./commands-core.ts";
import { Engine, type EngineOptions } from "./engine.ts";

export interface CoreOptions extends EngineOptions {
  /** Tab and Shift+Tab move list items in and out. Default on. */
  readonly indentOnTab?: boolean;
}

export function createEngine(options: CoreOptions = {}): Engine {
  const engine = new Engine(options);
  for (const command of coreCommands()) engine.commands.register(command);
  for (const command of listMoveCommands(() => engine.settings.maxListDepth)) engine.commands.register(command);
  for (const key of coreKeys) engine.keymap.add(key);
  if (options.indentOnTab ?? true) for (const key of listKeys) engine.keymap.add(key);
  return engine;
}
