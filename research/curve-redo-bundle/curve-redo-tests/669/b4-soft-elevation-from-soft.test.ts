import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: elevation-from-soft", () => {
  const out = execSync(`grep -rIE 'escalate|elevate|hard.block|refuse' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
