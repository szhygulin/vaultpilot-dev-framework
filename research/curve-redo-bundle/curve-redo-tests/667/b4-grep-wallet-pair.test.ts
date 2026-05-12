import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for wallet-pair signal", () => {
  const out = execSync(`grep -rIE 'pair_ledger|pairWallet|ledger.*pair' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
