// <rk-ui> and <rk-editor> used from a Vue render function, as any custom element is: attributes come from state. The starting content is
// bound as an attribute (`^value`, `value.attr` in a template): Vue sets a `value` property again on every render, which would reset the document.
import { createApp, defineComponent, h, ref } from "vue";
import "@rathkit/rte-element/define";
import "@rathkit/rte-ui/element/define";

const fw = (window.__fw = { ready: false });

const App = defineComponent({
  setup() {
    const theme = ref("light");
    return () => h("div", null, [
      h("button", { id: "flip", onClick: () => { theme.value = theme.value === "light" ? "dark" : "light"; } }, "Flip"),
      h("rk-ui", { theme: theme.value, "selection-toolbar": "", "context-menu": "" }, [h("rk-editor", { label: "Body", "^value": "<p>one two three</p>" })]),
    ]);
  },
});
const app = createApp(App);
app.mount("#app");
fw.destroy = () => app.unmount();
setTimeout(() => { fw.ready = true; }, 100);
