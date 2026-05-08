import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: section with bytes=0 does not throw", () => {
  const section = { id: "s0", bytes: 0 } as any;
  const record = {
    reinforcement: 1, references: 1, ref: 1,
    pushback: 0, incidents: 0, recency: 0.5, centrality: 0.5,
  } as any;
  assert.doesNotThrow(() => verdict(section, record, 1.0));
});
