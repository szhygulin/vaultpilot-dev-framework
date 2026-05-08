import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencyRefs } from "./dependencies.js";

test("parseDependencyRefs: random #N in prose without dep keyword is not captured", () => {
  const body = "We talked about #999 earlier and also referenced #555 in passing.\n";
  const refs = parseDependencyRefs(body);
  assert.equal(refs.length, 0);
});
