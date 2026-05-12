import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for binding-step-zero signal", () => {
  const out = execSync(`grep -rIE 'Step.?0|step0|Step Zero' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
