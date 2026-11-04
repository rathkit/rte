// The wrapper in an app built the way Angular builds apps: ahead of time, with templates type-checked against the wrapper's own
// declarations and no template compiler in the bundle. Both the directive and the forms entry point are used.
import { Component, effect, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { bootstrapApplication } from "@angular/platform-browser";
import { RteEditor, commandState } from "@rathkit/rte-angular";
import { RteValueAccessor } from "@rathkit/rte-angular/forms";
import type { Editor } from "@rathkit/rte-core/dom";

const fw = ((window as unknown as { __fw: Record<string, unknown> }).__fw = { ready: false, changes: [] as string[], events: [] as string[], readies: 0, commitCount: 0, values: [] as (string | null)[] } as Record<string, any>);
fw["commits"] = () => fw["commitCount"];

@Component({
  selector: "app-root",
  imports: [RteEditor, RteValueAccessor, ReactiveFormsModule],
  template: `
    <button id="bold" [attr.aria-pressed]="bold().active" [disabled]="!bold().enabled" (click)="run()">Bold</button>
    <div rteEditor label="Body" defaultValue="<p>one two three</p>" [readOnly]="!!access().readOnly" [disabled]="!!access().disabled" (ready)="onReady($event)" (change)="onChange($event)"
      (rteFocus)="onEvent('focus')" (rteBlur)="onEvent('blur')" (rteSelection)="onEvent('selection')"></div>
    <div rteEditor label="Control" [formControl]="control"></div>
  `,
})
class App {
  readonly editor = signal<Editor | undefined>(undefined);
  readonly access = signal<{ readOnly?: boolean; disabled?: boolean }>({});
  readonly bold = commandState(this.editor, "format.bold");
  readonly control = new FormControl<string | null>("<p>control</p>");
  constructor() {
    effect(() => { this.bold(); fw["commitCount"]++; });
    this.control.valueChanges.subscribe((v) => fw["values"].push(v));
    fw["control"] = this.control;
    fw["access"] = (next: { readOnly?: boolean; disabled?: boolean }) => this.access.set(next);
  }
  onReady(editor: Editor): void { fw["readies"]++; fw["editor"] = editor; this.editor.set(editor); }
  onChange(html: string): void { fw["changes"].push(html); }
  onEvent(name: string): void { fw["events"].push(name); }
  run(): void { this.editor()?.commands.run("format.bold"); }
}

bootstrapApplication(App).then((ref) => {
  fw["destroy"] = () => ref.destroy();
  fw["ready"] = true;
});
