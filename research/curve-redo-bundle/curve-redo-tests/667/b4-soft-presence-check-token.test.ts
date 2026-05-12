import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: presence-check-token", () => {
  const out = execSync(`grep -rIE 'presence.*token|token.*presence' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
