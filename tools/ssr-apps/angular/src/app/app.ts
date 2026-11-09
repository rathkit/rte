import { Component, signal } from "@angular/core";
import { RteEditor, commandState } from "@rathkit/rte-angular";
import type { Editor } from "@rathkit/rte-core/dom";

@Component({
  selector: "app-root",
  imports: [RteEditor],
  template: `
    <main>
      <h1>Angular</h1>
      <button id="bold" [attr.aria-pressed]="bold().active" [disabled]="!bold().enabled" (click)="run()">Bold</button>
      <div rteEditor label="Body" defaultValue="<p>one two three</p>" (ready)="onReady($event)"></div>
    </main>
  `,
})
export class App {
  editor = signal<Editor | undefined>(undefined);
  bold = commandState(this.editor, "format.bold");
  onReady(editor: Editor): void {
    this.editor.set(editor);
    (window as unknown as { __ssr: unknown }).__ssr = { ready: true, editor };
  }
  run(): void { this.editor()?.commands.run("format.bold"); }
}
