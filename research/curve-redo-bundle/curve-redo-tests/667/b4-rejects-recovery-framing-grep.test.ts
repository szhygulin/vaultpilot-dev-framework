import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("recovery-framing rejection keyword present", () => {
  const out = execSync(`grep -rIE 'recovery|reject.*recovery|"recovery"|disguised' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.trim().length).toBeGreaterThan(0);
});
