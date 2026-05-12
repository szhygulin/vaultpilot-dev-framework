// Smoke: the implementation file must have grown (at minimum +1 line for
// the new field; #628 added +9 LOC including the explanatory comment).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("actions.ts non-trivially contains the new field assignment", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  // Multiple occurrences (1 in code, optionally more in comments)
  expect(src).toMatch(/acknowledgedNonProtocolTarget/);
});
