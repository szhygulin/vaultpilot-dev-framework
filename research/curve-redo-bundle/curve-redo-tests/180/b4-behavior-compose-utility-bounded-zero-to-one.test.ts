import { test } from "node:test";
import assert from "node:assert/strict";
import * as mod from "./assessClaudeMd.js";

test("composeUtility: result is a number in [0, 1] for any record", () => {
  const compose = (mod as any).composeUtility;
  assert.equal(typeof compose, "function", "composeUtility export must be a function");
  const records: any[] = [
    {},
    { references: 1, reinforcement: 1, recency: 0.5 },
    {
      reinforcement: 999, references: 999, ref: 999,
      pushback: 999, pushbacks: 999,
      incidents: 999, pastIncidents: 999,
      recency: 1.0, lastCitedDaysAgo: 0,
      lastCitedAt: new Date().toISOString(),
      centrality: 1.0, crossRef: 1.0,
    },
  ];
  for (const r of records) {
    const u = compose(r);
    assert.equal(typeof u, "number", `non-number result: ${String(u)}`);
    assert.ok(Number.isFinite(u), `non-finite: ${u}`);
    assert.ok(u >= 0 && u <= 1, `out of range: ${u}`);
  }
});
