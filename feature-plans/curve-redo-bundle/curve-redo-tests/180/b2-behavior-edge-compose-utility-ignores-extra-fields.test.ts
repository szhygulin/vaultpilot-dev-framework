import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility tolerates extra unrelated fields on the record", () => {
  const record = {
    unknownField: "ignored",
    nested: { foo: 42 },
    arr: [1, 2, 3],
  } as any;
  const u = composeUtility(record);
  assert.ok(Number.isFinite(u), `expected finite, got ${u}`);
  assert.ok(u >= 0 && u <= 1, `expected u ∈ [0,1], got ${u}`);
});
