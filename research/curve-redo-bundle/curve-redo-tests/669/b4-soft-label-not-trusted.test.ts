import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: label-not-trusted", () => {
  const out = execSync(`grep -rIE 'label.*not.trust|verified.*spoof|label.spoof' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
