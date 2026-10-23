// Creates an engine with the standard commands and keys, ready to use without any DOM. Lists, images and the other optional
// parts come as plugins: see `@rathkit/rte-core/lists` and the other entry points.
import { coreCommands, coreKeys } from "./commands-core.ts";
import { Engine, type EngineOptions } from "./engine.ts";

export function createEngine(options: EngineOptions = {}): Engine {
  const engine = new Engine(options);
  for (const command of coreCommands()) engine.commands.register(command);
  for (const key of coreKeys) engine.keymap.add(key);
  return engine;
}
