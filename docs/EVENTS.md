# Events and options

Every package that gives you an editor reports the same five things, with the same timing and the same payloads, and takes the same
options. Only the spelling follows each framework's habits. This page is the one place they are all written down; the checks named at
the end fail if a package drifts from it.

## Events

| Event | When | Payload |
| --- | --- | --- |
| `ready` | the editor is built and usable | the editor |
| `change` | after an edit that altered the document's HTML | the HTML (a string) |
| `focus` | the editor itself gained the keyboard focus | the editor |
| `blur` | the editor itself lost the keyboard focus | the editor |
| `selection` | the caret or selection moved or changed (typing moves it too) | `{ anchor, focus }`, two positions in the document |

Timing rules, the same everywhere:

- `change` is reported for what a person or a command did. **Replacing the whole document with `setHtml`, setting `value`, or resetting
  a form is not a change**, as setting the value of a text field fires no `input`. A selection that only moved is not a change, and neither is
  an edit that leaves the HTML exactly as it was.
- `change` is reported after each edit, not batched: typing three letters reports three changes, each with the HTML as it was then.
- `ready` comes once, after the editor exists. A change or a selection never arrives before it.
- `focus` and `blur` follow the editor's own surface, not the page: focus moving between the editor and its toolbar buttons is a `blur`.

### Where each one is, per package

| | `ready` | `change` | `focus` | `blur` | `selection` |
| --- | --- | --- | --- | --- | --- |
| `@rathkit/rte-core/dom` (`Editor`) | the constructor returned | `editor.on("change", (html) => …)` | `editor.on("focus", (editor) => …)` | `editor.on("blur", …)` | `editor.on("selection", (selection) => …)` |
| `@rathkit/rte-element` | `rte-ready`, `detail.editor`; `whenReady()` | `rte-change`, `detail.html` | `rte-focus` | `rte-blur` | `rte-selection`, `detail.selection` |
| `@rathkit/rte-react` | `onReady` | `onChange` | `onFocus` | `onBlur` | `onSelection` |
| `@rathkit/rte-vue` | `@ready` | `@change` | `@focus` | `@blur` | `@selection` |
| `@rathkit/rte-svelte` | `onReady` | `onChange` | `onFocus` | `onBlur` | `onSelection` |
| `@rathkit/rte-angular` | `(ready)` | `(change)` | `(rteFocus)` | `(rteBlur)` | `(rteSelection)` |
| `@rathkit/rte-jquery` | `rte:ready` | `rte:change` | `rte:focus` | `rte:blur` | `rte:selection` |

- The element's events bubble and cross shadow boundaries, so one listener on a form or the document hears every editor inside it.
- The element also sends the two events a form field sends: `input` with each change (like `rte-change`, and not for a replaced
  document), and `change` when focus leaves and the value is not what it was when focus arrived.
- Angular's outputs for focus and blur are `rteFocus` and `rteBlur`, not `focus` and `blur`: those are also events of the element the
  directive sits on, so a handler would run for both. The rest keep the plain names.
- jQuery handlers get the payload as their second argument: `$(el).on("rte:change", (event, html) => …)`.

## Options

Passed as props, attributes or an options object, as the framework does it; the names and meanings are the same. "Live" means a later
change takes effect; every other option is read once when the editor is built, because rebuilding an editor under someone who is
typing is never what they meant.

| Option | Meaning | Core option | Element | React | Vue | Svelte | Angular | jQuery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Starting HTML | the document the editor starts with | `html` | `value` attribute, or the element's children; `value` property is live | `defaultValue` | `defaultValue` | `html` | `defaultValue` | `html` |
| Read-only | no edits; selection and copy still work (see [ACCESS.md](ACCESS.md)) | `readOnly` (`setReadOnly`, live) | `readonly` attribute (live) | `readOnly` (live) | `readOnly` (live) | `readOnly` (live, in `update`) | `readOnly` (live) | `readOnly` |
| Label | the name assistive technology announces | the surface's `aria-label` | `label` attribute (live) | `label` | `label` | `aria-label` on the element | `label` | `label` |
| Placeholder | a hint while the document is empty | `placeholder` (`setPlaceholder`, live) | `placeholder` attribute (live) | `placeholder` | `options.placeholder` | `placeholder` | `options.placeholder` | `placeholder` |
| Maximum length | typing and pasting past it are refused | `maxLength`, `onMaxLength` | `maxlength` attribute | `maxLength`, `onMaxLength` | `options.maxLength`, `options.onMaxLength` | `maxLength`, `onMaxLength` | `options.maxLength`, `options.onMaxLength` | `maxLength`, `onMaxLength` |
| Spellcheck | whether the browser checks spelling | `spellcheck` | `spellcheck` attribute | `spellcheck` | `options.spellcheck` | `spellcheck` | `options.spellcheck` | `spellcheck` |
| Autofocus | caret in the editor when it is made | `autofocus` | `autofocus` attribute | `autofocus` | `options.autofocus` | `autofocus` | `options.autofocus` | `autofocus` |
| Required | an empty document is invalid in a form | (a form concern) | `required` attribute (live) | | | | | |
| Direction | which way text reads | follows the page; a block's own direction is the `block.direction` command | `dir` on the element or an ancestor | same | same | same | same | same |
| Everything else (plugins, uploads, paste handlers) | | `StandardOptions` | `options` property, set before connecting | other props | `options` | other options | `options` | other options |

## What checks this

- `tools/browser-checks` (Chromium, Firefox, WebKit): the element sends `rte-focus`, `rte-selection` and `rte-blur` at the right
  moments; moving the caret sends no `rte-change`; setting `value` sends neither `rte-change` nor `input`.
- `tools/framework-checks` (the React, Vue, Svelte, Angular, Angular AOT and jQuery apps, in all three engines): each reports `focus`,
  `selection` and `blur`, reports no change for moving the caret or for `setHtml`, and reports the HTML for typing.
