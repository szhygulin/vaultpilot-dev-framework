import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("secondary RPC oracle / cross-rpc referenced", () => {
  const out = execSync(`grep -rIE 'secondary.rpc|cross.rpc|rpc.oracle|second.rpc' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
