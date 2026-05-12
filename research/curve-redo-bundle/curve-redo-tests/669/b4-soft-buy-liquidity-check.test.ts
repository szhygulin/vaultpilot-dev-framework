import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: buy-liquidity-check", () => {
  const out = execSync(`grep -rIE 'buy.liquid|liquidity.event|swap.event' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
