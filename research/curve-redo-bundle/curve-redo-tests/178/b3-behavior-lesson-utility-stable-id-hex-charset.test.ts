// Negative: any non-hex character (base64 padding, uppercase) breaks the
// contract that stable IDs are sha256 hex digests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: output is /^[0-9a-f]{64}$/", () => {
  const id = deriveStableId("run-A", "issue:#100");
  assert.match(id, /^[0-9a-f]{64}$/);
});

test("deriveStableId: output is not uppercase hex", () => {
  const id = deriveStableId("run-A", "issue:#100");
  assert.equal(id, id.toLowerCase());
});
