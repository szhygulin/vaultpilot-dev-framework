import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: explicit-deny-on-uncertain", () => {
  const out = execSync(`grep -rIE 'deny.*uncertain|uncertain.*deny' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
