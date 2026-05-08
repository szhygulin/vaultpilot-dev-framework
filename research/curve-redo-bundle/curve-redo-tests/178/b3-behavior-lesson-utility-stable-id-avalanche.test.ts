// Negative: an implementation that XORs or otherwise reuses prefixes would
// allow distinguishable inputs to share long hex prefixes — a structural bug.
// True sha256 avalanche makes shared 32-hex-char prefixes astronomically
// unlikely.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: 1-char runId mutation -> different 32-char prefix", () => {
  const a = deriveStableId("run-A", "issue:#100");
  const b = deriveStableId("run-B", "issue:#100");
  assert.notEqual(a.slice(0, 32), b.slice(0, 32));
});

test("deriveStableId: 1-char issueId mutation -> different 32-char prefix", () => {
  const a = deriveStableId("run-A", "issue:#100");
  const b = deriveStableId("run-A", "issue:#101");
  assert.notEqual(a.slice(0, 32), b.slice(0, 32));
});
