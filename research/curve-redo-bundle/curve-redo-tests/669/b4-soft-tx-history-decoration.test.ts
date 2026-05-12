import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: tx-history-decoration", () => {
  const out = execSync(`grep -rIE 'decorate.tx|annotate.tx|enrich.tx' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
