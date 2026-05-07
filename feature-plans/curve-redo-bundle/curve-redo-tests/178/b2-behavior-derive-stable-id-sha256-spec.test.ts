// Edge case: spec-conformance — the issue body specifies the exact formula
// `sha256(sentinel-runId + ':' + sentinel-issueId)`. The hash must match
// that byte-for-byte so cross-tool consumers can recompute it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: equals sha256(runId + ':' + issueId) per spec", () => {
  const expected = createHash("sha256").update("run-1:#100").digest("hex");
  assert.equal(deriveStableId("run-1", "#100"), expected);
});
