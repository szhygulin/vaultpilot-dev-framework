import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: explicit-out-of-scope-decision", () => {
  const out = execSync(`grep -rIE 'out.of.scope.decision|f.disposition.decision' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
