// Defensive: catches accidental object/number returns from misshapen impls.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: typeof return value is always 'string'", () => {
  for (const factor of [0.5, 1, 2, 5]) {
    for (const bytes of [10, 200, 5000]) {
      const out = verdict({ bytes } as any, {} as any, factor);
      assert.equal(typeof out, "string", `non-string verdict for bytes=${bytes} cost=${factor}`);
    }
  }
});
