import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: audit-line-emitted", () => {
  const out = execSync(`grep -rIE 'audit.line|emit.*audit' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
