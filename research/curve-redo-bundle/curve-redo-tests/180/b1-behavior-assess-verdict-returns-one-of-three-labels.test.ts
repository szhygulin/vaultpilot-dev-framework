import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict: result is always one of keep|trim|drop", () => {
  const cases: Array<[any, any, number]> = [
    [{ id: "s0", bytes: 100 }, { reinforcement: 100, pushback: 100, incidents: 100, lastCitedDaysAgo: 0, crossRefCentrality: 1 }, 1.0],
    [{ id: "s1", bytes: 100000 }, { reinforcement: 0, pushback: 0, incidents: 0, lastCitedDaysAgo: 9999, crossRefCentrality: 0 }, 5.0],
    [{ id: "s2", bytes: 1000 }, { reinforcement: 1, pushback: 1, incidents: 0, lastCitedDaysAgo: 30, crossRefCentrality: 0.2 }, 1.5],
    [{ id: "s3", bytes: 500 }, { reinforcement: 0, pushback: 0, incidents: 1, lastCitedDaysAgo: 50, crossRefCentrality: 0.1 }, 2.0],
  ];
  const allowed = new Set(["keep", "trim", "drop"]);
  for (const [section, record, factor] of cases) {
    const v = verdict(section as any, record as any, factor);
    assert.ok(allowed.has(v), `verdict returned unexpected label: ${v}`);
  }
});
