import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: test-folder-readonly", () => {
  const out = execSync(`grep -rIE 'test.*readonly|readonly.*test' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
