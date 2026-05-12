import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("vaultpilot-preflight skill referenced", () => {
  const out = execSync(`grep -rIE 'vaultpilot.preflight|preflight.skill|SKILL\\.md' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
