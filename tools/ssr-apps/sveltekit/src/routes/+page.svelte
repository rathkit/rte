<script>
  import { rteEditor } from "@rathkit/rte-svelte";

  // The surface is plain markup, so a server renders it as it is: the name and the marker are what the server sends, and the action
  // makes the editor on the client only.
  function ready(editor) {
    window.__ssr = { ready: true, editor };
  }
</script>

<main>
  <h1>SvelteKit</h1>
  <div aria-label="Body" data-rte-surface use:rteEditor={{ html: "<p>one two three</p>", onReady: ready }}></div>
</main>
