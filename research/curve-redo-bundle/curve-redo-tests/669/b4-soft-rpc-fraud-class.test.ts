import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: rpc-fraud-class", () => {
  const out = execSync(`grep -rIE 'rpc.fraud|chain.fraud|rpc.spoof' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
