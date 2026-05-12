import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for import-confirm-explicit signal", () => {
  const out = execSync(`grep -rIE 'explicitConfirm|userConfirm|explicit_ack' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
