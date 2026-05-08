import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("missing record yields 'keep' but explicit empty record does not (at non-trivial cost)", () => {
  // 'No signal yet' (record absent) is a different case from 'we measured
  // and saw zero signal' (record present but empty). The first should
  // fall back to keep; the second should be advised against keeping.
  const section = { bytes: 8192 } as any;
  const missing = verdict(section, undefined as any, 1.0);
  const explicitEmpty = verdict(section, {} as any, 1.0);
  assert.equal(missing, "keep");
  assert.notEqual(
    explicitEmpty,
    "keep",
    "explicit empty-signal record should not be 'keep'",
  );
});
