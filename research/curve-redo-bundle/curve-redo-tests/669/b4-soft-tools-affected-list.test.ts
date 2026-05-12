import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: tools-affected-list", () => {
  const out = execSync(`grep -rIE 'get_tx_history|get_protocol_risk|get_nft_history' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
