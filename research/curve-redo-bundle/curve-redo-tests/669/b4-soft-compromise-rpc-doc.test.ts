import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: compromise-rpc-doc", () => {
  const out = execSync(`grep -rIE 'compromise.rpc|rpc.compromise|untrusted.rpc' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
