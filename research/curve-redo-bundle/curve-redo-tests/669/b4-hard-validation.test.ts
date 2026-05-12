import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 hard grep: validation present in src/", () => {
  const out = execSync(`grep -rIE 'validate|sanitize|check' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
