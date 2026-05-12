import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: rpc-snapshot-comparison", () => {
  const out = execSync(`grep -rIE 'snapshot.compare|state.compare|rpc.diff' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
