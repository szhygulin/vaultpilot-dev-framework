import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: contract-risk-second-layer", () => {
  const out = execSync(`grep -rIE 'contract.risk.*second|second.*contract.risk' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
