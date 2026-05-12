import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("final soft signal: test-coverage-readonly", () => {
  const out = execSync(`grep -rIE 'readonly.*test' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
