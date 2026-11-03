// Entry for the Svelte template check. build.mjs compiles apps/ui-svelte.svelte with Svelte's own compiler into dist/gen first.
import { mount, unmount } from "svelte";
import App from "../dist/gen/ui-svelte.js";

const fw = (window.__fw = { ready: false });
const app = mount(App, { target: document.getElementById("app") });
fw.destroy = () => unmount(app);
setTimeout(() => { fw.ready = true; }, 100);
