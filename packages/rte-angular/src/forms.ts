// Angular forms: `ngModel`, `formControl` and `formControlName` on an element with `rteEditor`. This is its own entry point so that an
// app that does not use Angular forms never loads them. The value is the document's HTML.
import * as i0 from "@angular/core";
import { inject } from "@angular/core";
import { NG_VALUE_ACCESSOR } from "@angular/forms";
import { RteEditor } from "./editor.ts";

export class RteValueAccessor {
  private readonly host = inject(RteEditor, { self: true });
  private changed: (html: string) => void = () => undefined;
  private touched: () => void = () => undefined;

  constructor() {
    this.host.change.subscribe((html: string) => this.changed(html));
  }

  writeValue(value: string | null): void { this.host.setValue(value ?? ""); }
  registerOnChange(fn: (html: string) => void): void { this.changed = fn; }
  registerOnTouched(fn: () => void): void { this.touched = fn; }
  setDisabledState(disabled: boolean): void { this.host.disabled = disabled; }
  onTouched(): void { this.touched(); }

  static ɵfac: i0.ɵɵFactoryDeclaration<RteValueAccessor, never> = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "20.0.0", ngImport: i0, type: RteValueAccessor, deps: [], target: i0.ɵɵFactoryTarget.Directive });
  static ɵdir: i0.ɵɵDirectiveDeclaration<RteValueAccessor, "[rteEditor][formControlName],[rteEditor][formControl],[rteEditor][ngModel]", never, {}, {}, never, never, true, never> = i0.ɵɵngDeclareDirective({
    minVersion: "14.0.0",
    version: "20.0.0",
    type: RteValueAccessor,
    isStandalone: true,
    selector: "[rteEditor][formControlName],[rteEditor][formControl],[rteEditor][ngModel]",
    host: { listeners: { focusout: "onTouched()" } },
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: RteValueAccessor, multi: true }],
    ngImport: i0,
  });
}
