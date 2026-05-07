import { test } from "node:test";
import assert from "node:assert/strict";
import { KEEP_THRESHOLD, DROP_THRESHOLD } from "./assessClaudeMd.js";

test("thresholds are within a sane operator-tunable range", () => {
  // The benefit ratio is utility (0..1) divided by a byte-equivalent cost;
  // thresholds should be small positive values, not on the scale of
  // millions. We just sanity-bound them so a runaway placeholder is caught.
  assert.ok(KEEP_THRESHOLD < 1e6, `KEEP_THRESHOLD too large: ${KEEP_THRESHOLD}`);
  assert.ok(DROP_THRESHOLD < 1e6, `DROP_THRESHOLD too large: ${DROP_THRESHOLD}`);
});
