import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("Step 0 keyword present in src/", () => {
  const out = execSync(`grep -rIE 'Step 0|step.?zero' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
