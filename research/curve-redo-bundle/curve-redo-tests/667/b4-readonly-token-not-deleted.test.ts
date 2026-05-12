import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("import_readonly_token tool not deleted (regression)", () => {
  const out = execSync(`grep -rIE 'import_readonly_token' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
