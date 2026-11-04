# Read-only and disabled

Two states in which the person cannot change the document. They differ in whether the editor can still be reached.

| | Editable | Read-only | Disabled |
| --- | --- | --- | --- |
| The person can edit | yes | no | no |
| Focusable, in the tab order | yes | yes (`tabindex="0"`) | no (no `tabindex`) |
| Selecting text, copying | yes | yes | not by keyboard (it cannot be focused); a selection made with the mouse can still be copied |
| Announced as | an editable text box | `aria-readonly="true"` | `aria-disabled="true"` |
| Submitted with a form (`<rte-editor>`) | yes | yes | no |
| `contenteditable` on the surface | `true` | `false` | `false` |

Disabled is read-only plus unreachable: switching it on while the editor has the focus takes the focus away.
A page's own `tabindex` on the surface is put back when disabled is switched off.

## What is refused

Every way a person can change the document, in both states. One browser check (`access (readonly)` and `access (disabled)` in
`tools/browser-checks/run.mjs`) walks all of them in Chromium, Firefox and WebKit:

- keys: typing, Enter, Backspace, Delete, Tab, and the shortcuts for formatting, undo, redo and cut
- the input events a browser sends for spellcheck and autocorrect replacements, dictation, voice and menu commands (30 kinds, listed in the check)
- input-method composition
- paste (the event and `editor.paste()`) and cut
- drop of text, markup and files, and dragging the document's own text
- every command, by name, the editor's and the plugins' (each reports itself as not enabled, which is what a toolbar draws), and
  Replace and Replace all in find
- clicking a task's checkbox (the plugins' sizing handles for tables and images check the state before they start, but the walk does not
  drive them)
- undo and redo

## What still works

- Moving the caret and selecting (the selection is kept in the model and on the page).
- Copying the selection (the `copy` event gives the selected text).
- The host replacing the content: `setHtml`, `value`, and a form reset. That is the page changing its own field, not a person
  editing it, so it is not refused.
- History is kept while read-only or disabled, and undo works again when editing comes back. The editor does not undo while it is
  off.

## Using it

| Where | Read-only | Disabled |
| --- | --- | --- |
| `createEditor` / `Editor` | `readOnly` option, `setReadOnly(boolean)`, `readOnly` | `disabled` option, `setDisabled(boolean)`, `disabled` |
| `<rte-editor>` | `readonly` attribute and `readOnly` property | `disabled` attribute and `disabled` property; a disabled `<fieldset>` |
| Framework wrappers | `readOnly` prop | Not yet |

`editor.readOnly` is true in both states: it says whether edits are refused. `editor.disabled` says whether it is disabled.
While disabled, `setReadOnly(false)` is remembered but the editor stays read-only until it is enabled.
