// The editing surface as a component. Options are read once when it mounts, as the custom element reads them.
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watch } from "vue";
import type { Editor } from "@rathkit/rte-core/dom";
import { createEditor, type StandardOptions } from "@rathkit/rte-core/standard";

export type RteOptions = Omit<StandardOptions, "element" | "html" | "readOnly" | "disabled">;

export const RteEditor = defineComponent({
  name: "RteEditor",
  props: {
    /** The starting HTML. Later changes are ignored: call `editor.setHtml` to replace the document. */
    defaultValue: { type: String, default: "" },
    readOnly: { type: Boolean, default: false },
    /** Read-only, and not focusable or in the tab order. */
    disabled: { type: Boolean, default: false },
    /** The name screen readers announce for the editing surface. */
    label: { type: String, required: true },
    options: { type: Object, default: () => ({}) },
  },
  emits: ["change", "ready", "focus", "blur", "selection"],
  setup(props: { defaultValue: string; readOnly: boolean; disabled: boolean; label: string; options: RteOptions }, { emit, expose }: { emit: (name: string, ...args: unknown[]) => void; expose: (api: object) => void }) {
    const element = shallowRef<HTMLElement | null>(null);
    const editor = shallowRef<Editor | undefined>(undefined);
    let stop = (): void => undefined;
    onMounted(() => {
      const made = createEditor({ ...props.options, element: element.value!, html: props.defaultValue, readOnly: props.readOnly, disabled: props.disabled });
      const offs = [
        made.on("change", (html) => emit("change", html)),
        made.on("focus", (e) => emit("focus", e)),
        made.on("blur", (e) => emit("blur", e)),
        made.on("selection", (selection) => emit("selection", selection)),
      ];
      stop = () => { for (const off of offs) off(); made.destroy(); };
      editor.value = made;
      emit("ready", made);
    });
    onBeforeUnmount(() => { stop(); editor.value = undefined; });
    watch(() => props.readOnly, (readOnly) => editor.value?.setReadOnly(readOnly));
    watch(() => props.disabled, (disabled) => editor.value?.setDisabled(disabled));
    expose({ editor });
    return () => h("div", { ref: element, "aria-label": props.label, "data-rte-surface": "" });
  },
});
