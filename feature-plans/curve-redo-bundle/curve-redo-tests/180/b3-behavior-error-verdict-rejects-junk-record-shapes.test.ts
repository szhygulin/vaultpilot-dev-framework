// Real Phase 1 state files may drift in shape; the verdict pipeline must be defensive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: junk-typed record fields don't crash and still produce a valid enum", () => {
  const junkRecords: any[] = [
    { ref: "lots", pushback: "none" },
    { incidents: true, recency: false },
    { ref: null, pushback: null, incidents: null },
    { centrality: { weird: "object" } },
    [],
  ];
  for (const r of junkRecords) {
    let v: unknown;
    assert.doesNotThrow(() => {
      v = verdict({ bytes: 1024 } as any, r, 1.0);
    }, `threw on junk record ${JSON.stringify(r)}`);
    assert.ok(
      v === "keep" || v === "trim" || v === "drop",
      `non-enum verdict ${JSON.stringify(v)} for record ${JSON.stringify(r)}`,
    );
  }
});
