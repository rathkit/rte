// Tests run against a few-line stand-in for Angular, so the repo needs no copy of Angular. See angular-stub.ts for what it does.
import { register } from "node:module";
register("./resolve-angular.mjs", import.meta.url);
