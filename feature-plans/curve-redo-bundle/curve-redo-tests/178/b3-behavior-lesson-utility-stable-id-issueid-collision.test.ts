// Negative: distinct sentinel issueIds MUST NOT collide. If they did, two
// sections from the same run would share a stable ID and reinforcement
// counts would be merged silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: distinct issueIds yield distinct stable IDs", () => {
  const a = deriveStableId("run-A", "issue:#100");
  const b = deriveStableId("run-A", "issue:#101");
  assert.notEqual(a, b);
});
