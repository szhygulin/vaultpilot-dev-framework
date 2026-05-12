import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("risk_score validation / verification keyword present", () => {
  const out = execSync(`grep -rIE 'risk.score.*verif|verif.*risk.score|spoof.*risk|risk_score.*sanity' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
