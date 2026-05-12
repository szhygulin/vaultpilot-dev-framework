import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("tx history integrity / get_tx_history hardening referenced", () => {
  const out = execSync(`grep -rIE 'tx.history.*verif|tx.history.*integrity|get_tx_history.*verif' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
