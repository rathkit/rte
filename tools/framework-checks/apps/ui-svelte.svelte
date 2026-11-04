<!-- <rte-ui> and <rte-editor> used from a Svelte template, as any custom element is: attributes come from state. -->
<script>
  import "@rathkit/rte-element/define";
  import "@rathkit/rte-ui/element/define";
  let theme = $state("light");
</script>

<button id="flip" onclick={() => (theme = theme === "light" ? "dark" : "light")}>Flip</button>
<rte-ui {theme} selection-toolbar context-menu>
  <rte-editor label="Body" value="<p>one two three</p>"></rte-editor>
</rte-ui>
