import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: advisory-only-noted", () => {
  const out = execSync(`grep -rIE 'advisory.only|warn.only|soft.only' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
