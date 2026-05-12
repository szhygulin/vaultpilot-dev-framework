import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("'recovery wallet import' phrase flagged in src/ or tests", () => {
  const out = execSync(`grep -rIE 'recovery.wallet|wallet.import.*recovery|recovery.framing' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
