# The custom element

`@rathkit/rte-element` is the editor as web components, for any page or framework (and for none).

```html
<script type="importmap">{ "imports": { "@rathkit/rte-core/standard": "...", "@rathkit/rte-headless": "...", "@rathkit/rte-element": "..." } }</script>
<form>
  <rte-toolbar for="body"></rte-toolbar>
  <rte-editor id="body" name="body" label="Body" value="<p>Hello</p>" required></rte-editor>
</form>
<script type="module">import "@rathkit/rte-element/define";</script>
```

## `<rte-editor>`

It draws the editing surface only (a `div` inside it, in the light DOM, so the page's selection, labels and styles behave as for any element).

| | |
| --- | --- |
| Starting content | the `value` attribute, else whatever is written inside the element |
| `value` property | the document as HTML; setting it replaces the document and clears the undo history |
| `readonly`, `disabled` | make the surface read-only (`disabled` also follows a disabled `<fieldset>`) |
| `label` | names the editing surface; without one (or `aria-label` / `aria-labelledby`) a warning is logged |
| `required` | an empty document is invalid (`validity.valueMissing`), so the form will not submit |
| `name` | the form field name; the value submitted is the HTML |
| `options` property | what only code can give: an upload function, more plugins. Set it before the element is connected |
| `editor` property, `whenReady()` | the editor inside, for commands, items and subscriptions |
| Events | `rte-ready`, `rte-change` (detail `{ html }`), `rte-focus`, `rte-blur`, `rte-selection` (detail `{ selection }`), and the two a form field sends: `input` and `change` (when focus leaves and the value differs from when it arrived). Timing and payloads for every package: [EVENTS.md](EVENTS.md) |
| Forms | form-associated: submits its value, resets to its starting content, restores after navigation, honors `disabled` |

Moving the element keeps its content; removing it takes the editor down.

### Options as attributes

`placeholder` (a hint shown while empty; changing it takes effect), `maxlength` (the most characters; typing and pasting past it are refused), `spellcheck` (`true` or `false`), `autofocus`, as well as `label`, `value`, `readonly`, `disabled` and `required`. The same options are `placeholder`, `maxLength`, `onMaxLength`, `spellcheck` and `autofocus` on `createEditor`, and pass through the wrappers. The empty editor is marked `data-rte-empty` and carries `aria-placeholder`; the styled interface draws the hint, and a custom look can draw it from the custom property `--rte-placeholder` on that same element.

## `<rte-toolbar>`

A plain toolbar for an editor, built from the editor's interface items and made to behave by the headless layer (one tab stop, arrow
keys, `aria-pressed`, focus kept in the editor). It is unstyled and uses text labels; style it from the page, or draw your own from
`editor.ui.items("toolbar.main")` with `@rathkit/rte-headless`. A dialog item (Link) does not open anything by itself: the toolbar
dispatches `rte-open` with the item and the control, and the page, or the styled interface, answers.

`for` names the editor (default: the nearest `<rte-editor>`), `label` names the toolbar, `slot-name` picks which set of items.

## In a framework

Use the elements in a template like any custom element (Angular needs `CUSTOM_ELEMENTS_SCHEMA`). React 19 and Angular pass attributes and properties through as written. **In Vue, bind the starting content as an attribute**: `<rte-editor :value.attr="html">` (`"^value"` in a render function). Vue sets a `value` property again on every render, and setting `value` replaces the document, so a plain `:value` binding would throw away the person's edits each time anything else on the page changes. The `rte-ui` attributes (`theme`, `selection-toolbar`, and so on) are fine as ordinary bindings. These uses are checked against real React, Vue, Angular and Svelte in three browsers (Svelte compiles the template with its own compiler).

## A styled interface: `<rte-ui>`

`<rte-toolbar>` is plain on purpose. For the styled interface (themes, icons, find bar, status line, dialogs, and the optional selection toolbar and context menu), wrap the editor in `<rte-ui>` from `@rathkit/rte-ui/element`. See [UI.md](UI.md#as-an-element-rte-ui).

## Angular

`@rathkit/rte-angular` is the Angular wrapper: the `rteEditor` directive, signals for command state and an Angular forms value accessor (see its README). The custom element also works in Angular as it is. Add `CUSTOM_ELEMENTS_SCHEMA` to the component that uses it, import `@rathkit/rte-element/define` once, and bind the element's `value` property and `rte-change` event:

```ts
@Component({
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<rte-editor label="Body" [value]="html" (rte-change)="html = $event.detail.html"></rte-editor>`,
})
export class BodyField {
  html = "";
}
```

Because the element is form-associated, it also takes part in a native `<form>` without any Angular forms code. `ngModel` and reactive forms need the wrapper (`@rathkit/rte-angular/forms`).
