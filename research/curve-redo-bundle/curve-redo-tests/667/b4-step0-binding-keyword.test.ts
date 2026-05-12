import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("Step 0 / preflight binding keywords present in src/", () => {
  const out = execSync(`grep -rIE 'Step 0|preflight|sentinel|skill.pin' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.trim().length).toBeGreaterThan(0);
});
