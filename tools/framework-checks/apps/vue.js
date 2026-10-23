// A small app using the Vue wrapper, built with render functions so no template compiler is needed.
import { createApp, defineComponent, h, onUpdated, shallowRef, toRef } from "vue";
import { RteEditor, useCommand } from "@rathkit/rte-vue";

const fw = (window.__fw = { ready: false, changes: [], readies: 0, commitCount: 0 });
fw.commits = () => fw.commitCount;

const Bold = defineComponent({
  props: { editor: Object },
  setup(props) {
    const state = useCommand(toRef(props, "editor"), "format.bold");
    onUpdated(() => { fw.commitCount++; });
    return () => h("button", { id: "bold", "aria-pressed": String(state.value.active), disabled: !state.value.enabled, onClick: () => props.editor?.commands.run("format.bold") }, "Bold");
  },
});

const App = defineComponent({
  setup() {
    const editor = shallowRef(undefined);
    return () => h("div", null, [
      h(Bold, { editor: editor.value }),
      h(RteEditor, {
        label: "Body",
        defaultValue: "<p>one two three</p>",
        onChange: (html) => fw.changes.push(html),
        onReady: (e) => { fw.readies++; fw.editor = e; editor.value = e; },
      }),
    ]);
  },
});

const app = createApp(App);
app.mount("#app");
fw.destroy = () => app.unmount();
setTimeout(() => { fw.ready = true; }, 50);
