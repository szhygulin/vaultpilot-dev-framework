import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict returns a string", () => {
  const result = verdict({ bytes: 100 } as any, undefined as any, 1.0);
  assert.equal(typeof result, "string");
});
