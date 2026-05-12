import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("hard grep: preflight-skill-reference appears in src/", () => {
  const out = execSync(`grep -rIE 'preflight|vaultpilot.preflight' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
