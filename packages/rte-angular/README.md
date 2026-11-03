# @rathkit/rte-angular

> **Alpha.** Not for production: the APIs will change between releases. Published to the `next` tag only.

The editor for Angular: a standalone directive, signals over the headless layer, and an Angular forms value accessor. A signal changes only when the value it holds does. The editor runs outside Angular's change detection and only what it reports (an edit, the editor being ready) is brought back in, so typing does not check your views.

## Install

```sh
npm install @rathkit/rte-angular@next @rathkit/rte-core@next @rathkit/rte-headless@next
```

This package has no dependencies of its own. It works with `@rathkit/rte-core`, `@rathkit/rte-headless`, `@angular/core` and, for the forms entry point, `@angular/forms` (peer dependencies, all optional so that npm installs nothing you did not ask for), so install the ones you use alongside it; Angular comes from your own project. It is written in the form Angular's own build links, so it needs no Angular compiler to build and works with ahead-of-time and just-in-time apps alike. Checked against Angular 22.

## Example

```ts
import { Component, signal } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { RteEditor, commandState } from "@rathkit/rte-angular";
import type { Editor } from "@rathkit/rte-core/dom";

@Component({
  selector: "app-root",
  imports: [RteEditor],
  template: `
    <button [attr.aria-pressed]="bold().active" (click)="editor()?.commands.run('format.bold')">Bold</button>
    <div rteEditor label="Body" defaultValue="<p>Hello</p>" (ready)="editor.set($event)" (change)="log($event)"></div>
  `,
})
export class App {
  protected readonly editor = signal<Editor | undefined>(undefined);
  protected readonly bold = commandState(this.editor, "format.bold");
  protected log(html: string): void { console.log(html); }
}

bootstrapApplication(App);
```

`label` names the editing surface for screen readers and is required. `defaultValue` and `options` are read once, when the editor starts; `readOnly` can change at any time. The directive is exported as `rteEditor` (`#e="rteEditor"`), with `e.setValue(html)` to replace the document without it counting as an edit.

## Angular forms

```ts
import { RteEditor } from "@rathkit/rte-angular";
import { RteValueAccessor } from "@rathkit/rte-angular/forms";
// imports: [RteEditor, RteValueAccessor, ReactiveFormsModule]
// <div rteEditor label="Body" [formControl]="body"></div>
```

`ngModel`, `formControl` and `formControlName` work on an element with `rteEditor`. The value is the document's HTML; a disabled control makes the editor read-only; leaving the editor marks the control touched.

## More

Documentation: <https://rathkit.com>. Source and issues: <https://github.com/rathkit/rte>. What is checked: [SUPPORT.md](https://github.com/rathkit/rte/blob/main/docs/SUPPORT.md). Changes: [CHANGELOG.md](https://github.com/rathkit/rte/blob/main/CHANGELOG.md). How a release is verified: [VERIFY.md](https://github.com/rathkit/rte/blob/main/docs/VERIFY.md).

## License

[Apache-2.0](LICENSE)
