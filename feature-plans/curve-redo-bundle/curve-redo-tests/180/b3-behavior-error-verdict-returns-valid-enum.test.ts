// Contract: the verdict tag is a closed enum. Anything else is a regression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

const VALID = new Set(["keep", "trim", "drop"]);

test("verdict: every grid cell returns one of keep|trim|drop", () => {
  for (const bytes of [1, 100, 1024, 65536]) {
    for (const cost of [0.5, 1.0, 2.5, 10]) {
      const out = verdict({ bytes } as any, {} as any, cost);
      assert.ok(
        VALID.has(out as string),
        `unexpected verdict ${JSON.stringify(out)} for bytes=${bytes} cost=${cost}`,
      );
    }
  }
});
