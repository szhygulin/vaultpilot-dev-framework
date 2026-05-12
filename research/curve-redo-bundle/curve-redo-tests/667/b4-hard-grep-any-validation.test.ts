import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("hard grep: any-validation appears in src/", () => {
  const out = execSync(`grep -rIE 'validate|validation|sanitize|check' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
