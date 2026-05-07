// Negative: a merged section (compound issue token) MUST get a fresh stable
// ID; reusing the single-issue ID would steal another section's history.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: compound token #100+#101 differs from single #100", () => {
  const single = deriveStableId("run-A", "issue:#100");
  const compound = deriveStableId("run-A", "issue:#100+#101");
  assert.notEqual(single, compound);
});

test("deriveStableId: compound token #100+#101 differs from single #101", () => {
  const single = deriveStableId("run-A", "issue:#101");
  const compound = deriveStableId("run-A", "issue:#100+#101");
  assert.notEqual(single, compound);
});
