// Negative: '#100+#101' and '#100,#101' must hash to different values; an
// impl that normalizes punctuation would silently merge two distinct
// compound sentinels.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: '#100+#101' and '#100,#101' do not collide", () => {
  const a = deriveStableId("run-A", "issue:#100+#101");
  const b = deriveStableId("run-A", "issue:#100,#101");
  assert.notEqual(a, b);
});

test("deriveStableId: '#100+#101' and '#100 #101' do not collide", () => {
  const a = deriveStableId("run-A", "issue:#100+#101");
  const b = deriveStableId("run-A", "issue:#100 #101");
  assert.notEqual(a, b);
});
