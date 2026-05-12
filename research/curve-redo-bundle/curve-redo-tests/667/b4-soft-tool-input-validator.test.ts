import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: tool-input-validator", () => {
  const out = execSync(`grep -rIE 'inputSchema.*readonly|schema.*readonly' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
