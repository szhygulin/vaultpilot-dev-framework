import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict for huge bytes + zero-signal record returns 'drop'", () => {
  const result = verdict(
    { bytes: 1_000_000 } as any,
    {} as any,
    1.0,
  );
  assert.equal(result, "drop");
});
