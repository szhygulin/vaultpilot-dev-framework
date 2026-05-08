// Type-shape guard against accidental object returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeUtility } from "./assessClaudeMd.js";

test("composeUtility: returns a number primitive for empty/sparse records", () => {
  for (const record of [{} as any, { ref: 0 } as any, { incidents: 0, pushback: 0 } as any]) {
    const u = composeUtility(record);
    assert.equal(typeof u, "number", `non-number for record ${JSON.stringify(record)}`);
    assert.ok(!Number.isNaN(u));
  }
});
