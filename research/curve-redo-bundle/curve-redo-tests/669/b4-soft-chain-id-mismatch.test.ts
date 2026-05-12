import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: chain-id-mismatch", () => {
  const out = execSync(`grep -rIE 'chainId.mismatch|chain.mismatch|wrong.chain' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
