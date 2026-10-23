// Tests run against a few-line stand-in for Vue, so the repo needs no copy of Vue. See vue-stub.ts for what it does.
import { register } from "node:module";
register("./resolve-vue.mjs", import.meta.url);
