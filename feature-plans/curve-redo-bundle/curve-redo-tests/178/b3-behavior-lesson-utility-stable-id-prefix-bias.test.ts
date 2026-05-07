// Negative: a non-cryptographic hash (or a buggy 'first-N-bytes' impl) often
// shares prefixes for similar inputs. SHA-256 must not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStableId } from "./lessonUtility.js";

test("deriveStableId: 16-hex-char prefix differs across similar inputs", () => {
  const ids = [
    deriveStableId("run-A", "issue:#1"),
    deriveStableId("run-A", "issue:#2"),
    deriveStableId("run-A", "issue:#3"),
    deriveStableId("run-A", "issue:#4"),
  ];
  const prefixes = new Set(ids.map((id) => id.slice(0, 16)));
  // 4 distinct 16-hex prefixes from 4 close inputs is overwhelmingly likely.
  assert.equal(prefixes.size, 4);
});
