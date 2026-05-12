// Regression: curve-v1.test.ts must still parse as valid TS / vitest.
// Check for the describe/it structure rather than re-executing.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts retains describe block for buildCurveSwap", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  expect(src).toMatch(/describe\s*\(\s*"buildCurveSwap/);
});
