<!-- <rk-ui> and <rk-editor> used from a Svelte template, as any custom element is: attributes come from state. -->
<script>
  import "@rathkit/rte-element/define";
  import "@rathkit/rte-ui/element/define";
  let theme = $state("light");
</script>

<button id="flip" onclick={() => (theme = theme === "light" ? "dark" : "light")}>Flip</button>
<rk-ui {theme} selection-toolbar context-menu>
  <rk-editor label="Body" value="<p>one two three</p>"></rk-editor>
</rk-ui>
