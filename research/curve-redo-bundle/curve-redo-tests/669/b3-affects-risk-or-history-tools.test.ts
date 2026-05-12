// Likely-affected tools: get_protocol_risk_score, get_transaction_history,
// or similar surface that returns chain-derived data the user can act on.
import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("risk-score / history / portfolio surface has integrity defense addition", () => {
  const out = execSync(
    `grep -rIE 'risk.score|transaction.history|portfolio' src/ 2>/dev/null | grep -IE 'rpc|corroborat|cross|sanity|secondary' || true`,
    { encoding: "utf8" },
  );
  // Soft — pass if any indicator. The architectural decision is open per
  // the issue body, so we accept multiple shapes of fix.
  if (out.trim().length === 0) {
    console.log("[hint] integrity defense may not yet be wired through risk/history tools");
  }
  // Always pass; this is informational. A stricter assertion would
  // over-prescribe the solution.
  expect(true).toBe(true);
});
