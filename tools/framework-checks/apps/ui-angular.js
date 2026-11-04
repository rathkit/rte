// <rte-ui> and <rte-editor> used from an Angular template with CUSTOM_ELEMENTS_SCHEMA, as any custom element is.
import "@angular/compiler";
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import "@rathkit/rte-element/define";
import "@rathkit/rte-ui/element/define";

const fw = (window.__fw = { ready: false });

class App {
  theme = signal("light");
  flip() { this.theme.set(this.theme() === "light" ? "dark" : "light"); }
}
Component({
  selector: "app-root",
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<button id="flip" (click)="flip()">Flip</button>
    <rte-ui [attr.theme]="theme()" selection-toolbar context-menu><rte-editor label="Body" value="<p>one two three</p>"></rte-editor></rte-ui>`,
})(App);

bootstrapApplication(App).then((ref) => {
  fw.destroy = () => ref.destroy();
  fw.ready = true;
});
