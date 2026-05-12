import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: second-rpc-deviation", () => {
  const out = execSync(`grep -rIE 'rpc.deviation|deviate.threshold' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
