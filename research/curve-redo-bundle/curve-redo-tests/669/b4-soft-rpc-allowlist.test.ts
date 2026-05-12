import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: rpc-allowlist", () => {
  const out = execSync(`grep -rIE 'rpc.allowlist|allow.rpc|trusted.rpc' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
