# Errors and warnings

Four rules, in the order they matter.

1. **Content never throws.** Whatever markup, Markdown or plain text is loaded, set or pasted, the editor reads what it can, leaves
   out the rest and carries on. A document always results. (What is kept and dropped: [CONTENT-POLICY.md](CONTENT-POLICY.md).)
2. **One channel, with codes.** Every problem the editor carries on from is reported as a `Warning` to `onWarning`. Nothing is
   swallowed without a report, and nothing is reported that did not happen.
3. **A plugin that fails is isolated.** A plugin that throws is skipped for that call, and the editor and the other plugins go on.
4. **Misuse of the API throws.** A mistake in the code that builds the editor (adding the same plugin twice) throws at once, where
   the developer is looking.

## The channel

```ts
createEditor({ element, onWarning: (warning) => log(warning.code, warning.message, warning.plugin, warning.error) });
```

`Warning` is `{ code, message, plugin?, error? }`. `message` is for a person and says what was done about it. `plugin` names the plugin
concerned. `error` is what was caught. The codes are stable; switch on `code`, not on the text.

With no `onWarning` the warning goes to `console.warn` as `[rte] <code>: <message>`. `onWarning` is an option of `createEditor`,
of every framework wrapper and of `<rte-editor>` (its `options` property). A handler that throws is ignored: it cannot take the
editor down. Warnings are for developers; show a user-facing message with your own code, from the code you receive.

## Warning codes

| Code | When | What was done |
| --- | --- | --- |
| `plugin-failed` | A plugin threw while starting, or in a command, a command's state, a paste handler, a paste transform, a file handler, a normalizer, a text trigger, a copy formatter, a container behavior, a recognizer, the SVG cleaner, or its page part | The call was skipped; a plugin that failed to start was taken away with everything it had added |
| `plugin-rejected` | A plugin in the `plugins` option could not be added: its id was taken, or it needs a plugin API this editor does not have | That plugin was left out; the others were added |
| `plugin-message` | A plugin called `host.editor.warn(message)` | Nothing; the message is passed on |
| `key-conflict` | Two plugins claimed one key | The second binding was not made |
| `content-too-long` | Markup or pasted text was longer than `maxInputLength` | Nothing was read |
| `content-unreadable` | The reader failed on markup for a reason inside it | The content was left out |
| `copy-failed` | Copying to the clipboard failed (Copy as Markdown) | Nothing was copied |
| `upload-failed` | The `uploadImage` function threw or rejected | The image was left out (and `onImageRejected` was told) |
| `bad-option` | An option cannot be used (an unknown content profile, a depth that is not a whole number of at least 1) | The profile's value was used |
| `missing-label` | `<rte-editor>` has no `label`, `aria-label` or `aria-labelledby` | Nothing; the editor has no accessible name until one is given |
| `late-options` | `options` was set on `<rte-editor>` after it was connected | Nothing; they have no effect |
| `listener-failed` | Your `change`, `focus`, `blur` or `selection` listener, a `subscribe` listener or a `select` callback threw | The listener was skipped; the others still ran |

## What throws

| Call | Throws when |
| --- | --- |
| `editor.use(plugin)` / `engine.use(plugin)` | The id is already added, or the plugin needs a plugin API this editor does not have |
| `$(el).rteEditor("name")` | The method name is not one it has |
| Setup code a plugin runs | Never out of the editor: it is `plugin-failed`, and the plugin is left out |

Everything else reports. Commands return `false` when they do not apply. Loading, setting and pasting content never throw.

## What a plugin's failure does

| It threw in | Then |
| --- | --- |
| `setup` | The plugin is left out, with its commands, keys, handlers and interface items; the same id can be added again |
| A command's `run` | The command returns `false` and changes nothing |
| A command's `state` | The command is disabled |
| A paste handler, a text trigger, a container behavior, a recognizer or a copy formatter | It is treated as not handling the case; the editor's default runs |
| A paste transform | The pasted blocks go in unchanged |
| A file handler | It handles nothing; the next one is tried |
| A normalizer | The edit stands as it was made |
| The SVG cleaner | The SVG image is refused |
| Its page part (`view`) | The page part is left out; the rest of the plugin works |

## Bad options

An option that cannot be used is reported (`bad-option`) and replaced by the default; the editor starts. The content options are
checked one by one (see [CONTENT-POLICY.md](CONTENT-POLICY.md)): a profile that does not exist, a limit that is not a whole number
of at least 0 (a depth, at least 1), a list of link schemes that holds anything but scheme names.

## Not covered by this model

`@rathkit/rte-headless` has no editor; its dialog helper takes a `warn(message)` option of its own (default `console.warn`) and says
`A dialog needs a name` through it. Your own callbacks given as options (`onMaxLength`, `onImageRejected`, `uploadImage`) are called
as you wrote them; a throw inside `uploadImage` is reported, the others are yours to handle.
