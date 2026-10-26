// The editing surface as a directive. It is written as the compiled form of an Angular directive (the "partial" declaration the Angular
// build of an app links), so this package needs no Angular compiler of its own. Options are read once when the editor starts, as the
// custom element reads them; the editor lives outside Angular's change detection and only what it reports is brought back in.
import * as i0 from "@angular/core";
import { ElementRef, EventEmitter, NgZone, inject, signal } from "@angular/core";
import type { Editor } from "@rathkit/rte-core/dom";
import { createEditor, type StandardOptions } from "@rathkit/rte-core/standard";

export type RteOptions = Omit<StandardOptions, "element" | "html" | "readOnly">;

export class RteEditor {
  /** The name screen readers announce for the editing surface. */
  label = "";
  /** The starting HTML. Later changes are ignored: call `setValue` to replace the document. */
  defaultValue = "";
  options: RteOptions = {};
  /** The editor once it exists, as a signal. */
  readonly editor = signal<Editor | undefined>(undefined);
  /** Emits the document's HTML after each edit. Not for a document the host set with `setValue`. */
  readonly change = new EventEmitter<string>();
  /** Emits the editor when it is ready. */
  readonly ready = new EventEmitter<Editor>();

  private readonly element = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly zone = inject(NgZone);
  private readOnlyNow = false;
  private last = "";
  private stop = (): void => undefined;

  get readOnly(): boolean { return this.readOnlyNow; }
  set readOnly(value: boolean) {
    this.readOnlyNow = !!value;
    this.editor()?.setReadOnly(this.readOnlyNow);
  }

  /** Replaces the document without reporting it as an edit. Before the editor exists it is the starting document. */
  setValue(html: string): void {
    const editor = this.editor();
    if (!editor) { this.defaultValue = html; return; }
    this.last = html;
    editor.setHtml(html);
    this.last = editor.getHtml();
  }

  ngOnInit(): void {
    const made = this.zone.runOutsideAngular(() => createEditor({ ...this.options, element: this.element, html: this.defaultValue, readOnly: this.readOnlyNow }));
    this.last = made.getHtml();
    const off = made.subscribe(() => {
      const html = made.getHtml();
      if (html === this.last) return;
      this.last = html;
      this.zone.run(() => this.change.emit(html));
    });
    this.stop = () => { off(); made.destroy(); };
    this.editor.set(made);
    this.ready.emit(made);
  }

  ngOnDestroy(): void {
    this.stop();
    this.editor.set(undefined);
  }

  // The types are what an Angular build reads from the .d.ts file to know this is a directive, and which inputs and outputs it has.
  static ɵfac: i0.ɵɵFactoryDeclaration<RteEditor, never> = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.0.0", ngImport: i0, type: RteEditor, deps: [], target: i0.ɵɵFactoryTarget.Directive });
  static ɵdir: i0.ɵɵDirectiveDeclaration<RteEditor, "[rteEditor]", ["rteEditor"],
    { "label": { "alias": "label"; "required": true }; "defaultValue": { "alias": "defaultValue"; "required": false }; "options": { "alias": "options"; "required": false }; "readOnly": { "alias": "readOnly"; "required": false } },
    { "change": "change"; "ready": "ready" }, never, never, true, never> = i0.ɵɵngDeclareDirective({
    minVersion: "17.1.0",
    version: "20.0.0",
    type: RteEditor,
    isStandalone: true,
    selector: "[rteEditor]",
    inputs: {
      label: { classPropertyName: "label", publicName: "label", isSignal: false, isRequired: true, transformFunction: null },
      defaultValue: { classPropertyName: "defaultValue", publicName: "defaultValue", isSignal: false, isRequired: false, transformFunction: null },
      options: { classPropertyName: "options", publicName: "options", isSignal: false, isRequired: false, transformFunction: null },
      readOnly: { classPropertyName: "readOnly", publicName: "readOnly", isSignal: false, isRequired: false, transformFunction: null },
    },
    outputs: { change: "change", ready: "ready" },
    host: { attributes: { "data-rk-surface": "" }, properties: { "attr.aria-label": "label" } },
    exportAs: ["rteEditor"],
    ngImport: i0,
  });
}
