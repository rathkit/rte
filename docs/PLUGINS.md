# Plugins and entry points

The core is the part that every editor needs. Everything else is a plugin that uses only what any plugin is given. The status
of this API is experimental: it can still change until the same plugin has been shown to work with both a custom interface and
the styled one (see `HEADLESS.md`).

## Entry points of `@rathkit/rte-core`

| Entry | What it is | Size, gzipped and minified |
| --- | --- | --- |
| `@rathkit/rte-core` | Model, import and export, edit operations, the engine, commands, keys, the plugin host, paste | 17 KB |
| `@rathkit/rte-core/dom` | The browser view (`Editor`) | 3.5 KB more |
| `@rathkit/rte-core/lists` | Bulleted, numbered and definition lists: commands, Tab, Enter and Backspace in items, typed shortcuts | 3.5 KB |
| `@rathkit/rte-core/word` | Reads lists the way word processors write them | 1.1 KB |
| `@rathkit/rte-core/svg` | The SVG cleaner; lets content carry SVG images once cleaned | 2.5 KB |
| `@rathkit/rte-core/images` | The image policy: upload hook, inline limit, reports | 1.2 KB |
| `@rathkit/rte-core/standard` | `createEditor()`: the editor with all of the above wired in | |

Budgets are 60 KB for the core and 15 KB for each plugin. The sizes above come from `rathkit-pack`'s minifier and are provisional
while that is still changing; CI checks the stricter unminified number. `pnpm check:graph` fails if a core file imports a
plugin, so "core without plugins" stays true.

## What stays in the core, and why

A document with lists must load, draw, save and survive deleting across items with no plugin, so the core keeps the list and
definition-list model, their addressing, their import and export, and how they are drawn. What the plugin adds is the editing
behavior: the commands, the keys, how Enter, Backspace and paste work inside items, and the typed shortcuts. Without the lists
plugin, Enter in an item is a line break and blocks pasted into an item become lines of text in it.

## What a plugin can do (`PluginHost`)

| Hook | Use |
| --- | --- |
| `command(def)` | Add a named command with its state. |
| `keybinding(binding)` | Bind a key chord to a command. Two plugins claiming one chord give a warning and the first keeps it. |
| `behavior(kind, behavior)` | Own Enter, Backspace-at-start and paste in a kind of container (`li`, `dt`, `dd`). One plugin per kind. |
| `textTrigger(fn)` | See typed text before it is inserted and take it over (a list shortcut). |
| `importOptions({ sanitizeSvg, recognizers })` | Teach the importer: clean SVG images; recognize a source's markup. Recognizers return data, not importer internals. |
| `pasteTransform(fn)` | Change pasted blocks before they go in; may take time (an upload). |
| `fileHandler(fn)` | Turn pasted and dropped files into blocks. |
| `pasteHandler(fn)` | See the raw clipboard before anything is sanitized. |
| `ops` | The editing operations as plain functions, so a plugin does not import the editor. |

A plugin names the plugin API versions it supports (`api: ">=1 <2"`), and a mismatch fails when it is added. Removing a plugin takes
everything it added away. A plugin file should contain only `import type` lines from the core (`mentions.sample.ts` is checked for that).
The lists, word, SVG and images plugins are built the same way, and a test (`plugins-use-host.test.ts`) fails if one of them takes anything from the core that is not also in `ops`, so an outside plugin can do everything these do through the host.
