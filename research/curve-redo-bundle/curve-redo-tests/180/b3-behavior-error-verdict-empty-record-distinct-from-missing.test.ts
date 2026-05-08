// Issue contract: 'no signal yet' (undefined) -> keep. An empty record is a present record with
// all-zero metrics and must NOT inherit the same fallback (otherwise the assess tool would never
// drop anything until the agent's metrics file disappears).
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: empty {} record on a costly section is not silently 'keep'", () => {
  const undef = verdict({ bytes: 10_000 } as any, undefined, 5);
  const empty = verdict({ bytes: 10_000 } as any, {} as any, 5);
  assert.equal(undef, "keep");
  assert.notEqual(
    empty,
    "keep",
    "empty record (zero signal) on an expensive section must NOT default to 'keep' the same way undefined does",
  );
});
