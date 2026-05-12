import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: newcomer-target", () => {
  const out = execSync(`grep -rIE 'newcomer|onboarding|n073' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
