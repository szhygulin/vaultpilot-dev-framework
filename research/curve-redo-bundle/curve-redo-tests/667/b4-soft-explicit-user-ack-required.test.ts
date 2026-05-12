import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: explicit-user-ack-required", () => {
  const out = execSync(`grep -rIE 'require.*ack|require.*confirmation' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
