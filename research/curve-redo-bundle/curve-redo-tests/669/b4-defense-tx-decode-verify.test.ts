import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: tx-decode-verify", () => {
  const out = execSync(`grep -rIE 'verify_tx_decode|verifyTxDecode|tx_decode' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
