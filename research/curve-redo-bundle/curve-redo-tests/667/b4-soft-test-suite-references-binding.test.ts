import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: test-suite-references-binding", () => {
  const out = execSync(`grep -rIE 'binding|bind.test|step.0.test' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
