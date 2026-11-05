// The Angular wrapper, run the way an app that is not built with the Angular compiler runs it: the compiler is loaded and the component
// is made at run time. The wrapper itself is already in the compiled form, so this checks that form against the real Angular.
import "@angular/compiler";
import { Component, effect, signal } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { RteEditor, commandState } from "@rathkit/rte-angular";

const fw = (window.__fw = { ready: false, changes: [], events: [], readies: 0, commitCount: 0 });
fw.commits = () => fw.commitCount;

class App {
  editor = signal(undefined);
  access = signal({});
  bold = commandState(this.editor, "format.bold");
  constructor() {
    // Counts how often the bold state changes, which is how often anything reading it is woken.
    effect(() => { this.bold(); fw.commitCount++; });
    fw.access = (next) => this.access.set(next);
  }
  onReady(editor) { fw.readies++; fw.editor = editor; this.editor.set(editor); }
  onChange(html) { fw.changes.push(html); }
  onEvent(name, payload) { fw.events.push(name !== "selection" || (payload.anchor && payload.focus) ? name : "bad"); }
  run() { this.editor()?.commands.run("format.bold"); }
}
Component({
  selector: "app-root",
  imports: [RteEditor],
  template: `<button id="bold" [attr.aria-pressed]="bold().active" [disabled]="!bold().enabled" (click)="run()">Bold</button>
    <div rteEditor label="Body" defaultValue="<p>one two three</p>" [readOnly]="!!access().readOnly" [disabled]="!!access().disabled" (ready)="onReady($event)" (change)="onChange($event)"
      (rteFocus)="onEvent('focus', $event)" (rteBlur)="onEvent('blur', $event)" (rteSelection)="onEvent('selection', $event)"></div>`,
})(App);

class Leaf {}
Component({
  selector: "leak-root",
  imports: [RteEditor],
  template: `<div rteEditor label="Leak" defaultValue="<p>leak</p>"></div>`,
})(Leaf);
// Starts and destroys an application with the wrapper in it n times, for the leak walk.
fw.cycle = async (n) => {
  for (let i = 0; i < n; i++) {
    const host = document.body.appendChild(document.createElement("leak-root"));
    const leaf = await bootstrapApplication(Leaf);
    await leaf.whenStable();
    leaf.destroy();
    host.remove();
  }
};

bootstrapApplication(App).then((ref) => {
  fw.destroy = () => ref.destroy();
  fw.ready = true;
});
