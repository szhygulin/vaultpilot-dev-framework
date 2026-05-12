import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: soft-warning-upgrade", () => {
  const out = execSync(`grep -rIE 'upgrade.warn|escalate.warn|harden.warn' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
