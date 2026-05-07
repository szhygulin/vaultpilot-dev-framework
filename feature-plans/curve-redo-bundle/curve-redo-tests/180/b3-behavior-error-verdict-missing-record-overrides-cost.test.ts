// The fallback is unconditional per issue spec — operators rely on this to avoid silently dropping
// sections that haven't accumulated signal yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: undefined record + huge bytes + huge cost still keeps", () => {
  assert.equal(verdict({ bytes: 1_000_000 } as any, undefined, 1000), "keep");
});

test("verdict: undefined record + tiny bytes still keeps", () => {
  assert.equal(verdict({ bytes: 1 } as any, undefined, 0.01), "keep");
});
