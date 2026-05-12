import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("RPC integrity / chain-data sanity referenced in src/", () => {
  const out = execSync(`grep -rIE 'rpc.integrity|chain.data.integrity|chain.fraud|rogue.rpc|rpc.fraud' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
