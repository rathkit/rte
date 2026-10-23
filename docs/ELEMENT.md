# The custom element

`@rathkit/rte-element` is the editor as web components, for any page or framework (and for none).

```html
<script type="importmap">{ "imports": { "@rathkit/rte-core/standard": "...", "@rathkit/rte-headless": "...", "@rathkit/rte-element": "..." } }</script>
<form>
  <rk-toolbar for="body"></rk-toolbar>
  <rk-editor id="body" name="body" label="Body" value="<p>Hello</p>" required></rk-editor>
</form>
<script type="module">import "@rathkit/rte-element/define";</script>
```

## `<rk-editor>`

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
| Events | `rk-change` (detail `{ html }`), `input` (like a form field), `change` when focus leaves and the value differs from when it arrived, `rk-ready` |
| Forms | form-associated: submits its value, resets to its starting content, restores after navigation, honors `disabled` |

Moving the element keeps its content; removing it takes the editor down.

## `<rk-toolbar>`

A plain toolbar for an editor, built from the editor's interface items and made to behave by the headless layer (one tab stop, arrow
keys, `aria-pressed`, focus kept in the editor). It is unstyled and uses text labels; style it from the page, or draw your own from
`editor.ui.items("toolbar.main")` with `@rathkit/rte-headless`. A dialog item (Link) does not open anything by itself: the toolbar
dispatches `rk-open` with the item and the control, and the page, or the styled interface, answers.

`for` names the editor (default: the nearest `<rk-editor>`), `label` names the toolbar, `slot-name` picks which set of items.

## Angular

The Angular wrapper (a standalone component with the forms `ControlValueAccessor`) is not built yet. Until it is, the custom element works in Angular as it is. Add `CUSTOM_ELEMENTS_SCHEMA` to the component that uses it, import `@rathkit/rte-element/define` once, and bind the element's `value` property and `rk-change` event:

```ts
@Component({
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<rk-editor label="Body" [value]="html" (rk-change)="html = $event.detail.html"></rk-editor>`,
})
export class BodyField {
  html = "";
}
```

Because the element is form-associated, it also takes part in a native `<form>` without any Angular forms code. `ngModel` and reactive forms need the wrapper.
