// The jQuery plugin over the custom element, with jQuery 4.
import $ from "jquery";
import "@rathkit/rte-element/define";
import { install } from "@rathkit/rte-jquery";

globalThis.jQuery = $;
install($);
const fw = (window.__fw = { ready: false, changes: [], readies: 0, commitCount: 0 });
fw.commits = () => fw.commitCount;

$("#host").on("rk:change", (_event, html) => fw.changes.push(html));
$("#host").rkEditor({ label: "Body", html: "<p>one two three</p>" });
$("#host").rkEditor("editor").then((editor) => {
  fw.readies++;
  fw.editor = editor;
  const paint = (s) => {
    fw.commitCount++;
    $("#bold").attr("aria-pressed", String(s.active)).prop("disabled", !s.enabled);
  };
  paint(editor.commands.state("format.bold"));
  editor.commands.subscribe("format.bold", () => paint(editor.commands.state("format.bold")));
  $("#bold").on("click", () => editor.commands.run("format.bold"));
  fw.ready = true;
});
fw.destroy = () => $("#host").rkEditor("destroy");
