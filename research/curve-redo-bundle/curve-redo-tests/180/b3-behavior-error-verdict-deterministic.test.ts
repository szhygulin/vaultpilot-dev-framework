// Determinism is a contract violation when broken: random seeds, time-dependent calls, etc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: identical inputs produce identical output across repeats", () => {
  const section = { bytes: 2048 } as any;
  const record = {} as any;
  const factor = 1.5;
  const first = verdict(section, record, factor);
  for (let i = 0; i < 50; i++) {
    assert.equal(verdict(section, record, factor), first);
  }
});
