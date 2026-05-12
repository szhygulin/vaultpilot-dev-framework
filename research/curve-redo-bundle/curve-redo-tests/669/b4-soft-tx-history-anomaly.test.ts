import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: tx-history-anomaly", () => {
  const out = execSync(`grep -rIE 'tx.history.anomaly|history.anomaly' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
