// The Angular wrapper, run the way an app that is not built with the Angular compiler runs it: the compiler is loaded and the component
// is made at run time. The wrapper itself is already in the compiled form, so this checks that form against the real Angular.
import "@angular/compiler";
import { Component, effect, signal } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { RteEditor, commandState } from "@rathkit/rte-angular";

const fw = (window.__fw = { ready: false, changes: [], readies: 0, commitCount: 0 });
fw.commits = () => fw.commitCount;

class App {
  editor = signal(undefined);
  bold = commandState(this.editor, "format.bold");
  constructor() {
    // Counts how often the bold state changes, which is how often anything reading it is woken.
    effect(() => { this.bold(); fw.commitCount++; });
  }
  onReady(editor) { fw.readies++; fw.editor = editor; this.editor.set(editor); }
  onChange(html) { fw.changes.push(html); }
  run() { this.editor()?.commands.run("format.bold"); }
}
Component({
  selector: "app-root",
  imports: [RteEditor],
  template: `<button id="bold" [attr.aria-pressed]="bold().active" [disabled]="!bold().enabled" (click)="run()">Bold</button>
    <div rteEditor label="Body" defaultValue="<p>one two three</p>" (ready)="onReady($event)" (change)="onChange($event)"></div>`,
})(App);

bootstrapApplication(App).then((ref) => {
  fw.destroy = () => ref.destroy();
  fw.ready = true;
});
