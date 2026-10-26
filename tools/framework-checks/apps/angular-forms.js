// The Angular forms entry point against the real @angular/forms: a reactive control and an ngModel, on one editor each.
import "@angular/compiler";
import { Component, signal } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { FormControl, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { RteEditor } from "@rathkit/rte-angular";
import { RteValueAccessor } from "@rathkit/rte-angular/forms";

const fw = (window.__fw = { ready: false, values: [], model: signal("<p>model</p>") });

class App {
  control = new FormControl("<p>control</p>");
  model = fw.model;
  constructor() {
    this.control.valueChanges.subscribe((v) => fw.values.push(v));
    fw.control = this.control;
  }
}
Component({
  selector: "app-root",
  imports: [RteEditor, RteValueAccessor, ReactiveFormsModule, FormsModule],
  template: `<div rteEditor label="Control" [formControl]="control" id="control"></div>
    <div rteEditor label="Model" [ngModel]="model()" (ngModelChange)="model.set($event)" id="model"></div>`,
})(App);

bootstrapApplication(App).then((ref) => {
  fw.destroy = () => ref.destroy();
  fw.ready = true;
});
