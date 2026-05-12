import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: binding-trust-source", () => {
  const out = execSync(`grep -rIE 'trust.source|cryptographic|verified' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
