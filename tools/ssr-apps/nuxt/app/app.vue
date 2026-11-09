<script setup>
import { shallowRef } from "vue";
import { RteEditor, useCommand } from "@rathkit/rte-vue";

const editor = shallowRef(undefined);
const bold = useCommand(editor, "format.bold");
function ready(e) {
  editor.value = e;
  window.__ssr = { ready: true, editor: e };
}
</script>

<template>
  <main>
    <h1>Nuxt</h1>
    <button id="bold" :aria-pressed="String(bold.active)" :disabled="!bold.enabled" @click="editor?.commands.run('format.bold')">Bold</button>
    <RteEditor label="Body" default-value="<p>one two three</p>" @ready="ready" />
  </main>
</template>
