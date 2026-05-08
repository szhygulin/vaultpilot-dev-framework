import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDependencies } from "./dependencies.js";

test("parseDependencies: empty body returns empty result", () => {
  const refs = parseDependencies("");
  assert.equal([...refs].length, 0);
});
