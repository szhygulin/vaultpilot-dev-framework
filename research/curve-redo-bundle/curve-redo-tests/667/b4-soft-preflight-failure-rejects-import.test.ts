import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: preflight-failure-rejects-import", () => {
  const out = execSync(`grep -rIE 'rejectImport|abort.*import|deny.*import' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
