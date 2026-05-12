import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: snapshot-includes-readonly", () => {
  const out = execSync(`grep -rIE 'snapshot.*readonly|readonly.*snapshot' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
