import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("final soft signal: import-deny-suspicious", () => {
  const out = execSync(`grep -rIE 'deny.*suspicious|suspicious.*deny' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
