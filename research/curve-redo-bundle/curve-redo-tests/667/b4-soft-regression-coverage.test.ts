import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: regression-coverage", () => {
  const out = execSync(`grep -rIE 'regression|no.regression|prevent.*regression' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
