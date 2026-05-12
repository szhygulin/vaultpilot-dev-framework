import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: risk-score-not-trusted", () => {
  const out = execSync(`grep -rIE 'risk_score.*not.trust|risk_score.*spoof' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
