import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";

// The packages are the repository's built ones, copied into node_modules by the runner; nothing is fetched while building.
export default { plugins: [sveltekit({ adapter: adapter() })] };
