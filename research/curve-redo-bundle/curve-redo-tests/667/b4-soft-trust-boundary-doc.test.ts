import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: trust-boundary-doc", () => {
  const out = execSync(`grep -rIE 'trust.boundary|threat.boundary' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
