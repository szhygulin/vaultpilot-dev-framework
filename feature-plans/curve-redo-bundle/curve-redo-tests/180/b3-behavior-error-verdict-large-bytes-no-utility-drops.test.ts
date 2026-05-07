// Contract: zero-utility, expensive section -> 'drop'. Anything else means the threshold logic is broken.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: empty utility record + large bytes + nontrivial cost factor -> 'drop'", () => {
  const result = verdict({ bytes: 10_000 } as any, {} as any, 2.0);
  assert.equal(
    result,
    "drop",
    "section with no utility evidence and meaningful byte cost must be a drop candidate",
  );
});
