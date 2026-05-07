import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: result is always one of 'keep' | 'trim' | 'drop'", () => {
  const section = { id: "s0", bytes: 500 } as any;
  const records: any[] = [
    {},
    { references: 1, reinforcement: 1 },
    { references: 100, reinforcement: 100, pushback: 100, incidents: 100, centrality: 1, recency: 1 },
  ];
  for (const r of records) {
    const result = verdict(section, r, 1.0);
    assert.ok(result === "keep" || result === "trim" || result === "drop", `unexpected: ${String(result)}`);
  }
});
