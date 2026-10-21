import assert from "node:assert/strict";
import { test } from "node:test";
import { PACKAGE_NAME } from "./index.ts";

test("package exports its own name", () => {
  assert.equal(PACKAGE_NAME, "@rathkit/rte-core");
});
