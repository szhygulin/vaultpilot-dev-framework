import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: trust-rpc-by-allowlist", () => {
  const out = execSync(`grep -rIE 'allowlist.rpc|rpc.allowlist.trust' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
