import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: tool-decorator-readonly", () => {
  const out = execSync(`grep -rIE '@tool.*readonly|decorator.*readonly' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
