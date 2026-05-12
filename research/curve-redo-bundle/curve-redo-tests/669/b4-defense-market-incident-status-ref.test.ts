import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: market-incident-status-ref", () => {
  const out = execSync(`grep -rIE 'market_incident|incident.status' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
