// Tests run against a few-line stand-in for React, so the repo needs no copy of React. See react-stub.ts for what it does.
import { register } from "node:module";
register("./resolve-react.mjs", import.meta.url);
