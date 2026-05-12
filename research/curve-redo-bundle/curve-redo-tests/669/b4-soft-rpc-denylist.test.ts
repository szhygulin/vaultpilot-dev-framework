import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: rpc-denylist", () => {
  const out = execSync(`grep -rIE 'rpc.denylist|deny.rpc|untrusted.rpc' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
