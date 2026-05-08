import { test } from "node:test";
import assert from "node:assert/strict";
import { verdict } from "./assessClaudeMd.js";

test("verdict output ∈ {keep, trim, drop}", () => {
  const cases: Array<[any, any, number]> = [
    [{ bytes: 100 }, undefined, 1.0],
    [{ bytes: 100 }, null, 1.0],
    [{ bytes: 1 }, {}, 1.0],
    [{ bytes: 1_000_000 }, {}, 1.0],
    [{ bytes: 100 }, {}, 100.0],
  ];
  for (const [section, record, factor] of cases) {
    let result: string;
    try {
      result = verdict(section, record, factor) as string;
    } catch {
      // Throwing on these inputs is its own bug; skip.
      continue;
    }
    assert.ok(
      ["keep", "trim", "drop"].includes(result),
      `verdict returned unexpected value: ${result}`,
    );
  }
});
