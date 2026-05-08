// Negative: an implementation that does Buffer.from(input,'ascii') would
// silently lose information for unicode runIds and break determinism
// across platforms.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: unicode input deterministic and 64-hex", () => {
  const a = deriveStableId("run-α-β", "issue:#1");
  const b = deriveStableId("run-α-β", "issue:#1");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("deriveStableId: unicode runId distinct from latin lookalike", () => {
  const greek = deriveStableId("run-α", "issue:#1");
  const latin = deriveStableId("run-a", "issue:#1");
  assert.notEqual(greek, latin);
});
