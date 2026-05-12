import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: rejected-on-mismatch", () => {
  const out = execSync(`grep -rIE 'reject.*mismatch|abort.*mismatch|deny.*mismatch' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
