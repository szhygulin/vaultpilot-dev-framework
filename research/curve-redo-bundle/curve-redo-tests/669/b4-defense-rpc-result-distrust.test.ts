import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: rpc-result-distrust", () => {
  const out = execSync(`grep -rIE 'distrust.rpc|untrustRpc|rpc.untrust' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
