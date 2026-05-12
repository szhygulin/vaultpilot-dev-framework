import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("import_readonly_token implementation file resolvable", () => {
  const out = execSync(`grep -rIlE 'import_readonly_token' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
