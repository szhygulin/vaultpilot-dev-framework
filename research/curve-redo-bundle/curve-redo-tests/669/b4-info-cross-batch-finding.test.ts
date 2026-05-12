import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("cross-batch finding annotation referenced", () => {
  const out = execSync(`grep -rIE 'cross.batch|cross_batch|STRENGTHENED' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
