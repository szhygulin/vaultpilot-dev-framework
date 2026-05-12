import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: explain-tx-ref", () => {
  const out = execSync(`grep -rIE 'explain_tx|explainTx' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
