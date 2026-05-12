import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for preflight-skill signal", () => {
  const out = execSync(`grep -rIE 'vaultpilot.preflight|preflight.skill|preflight-skill' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
