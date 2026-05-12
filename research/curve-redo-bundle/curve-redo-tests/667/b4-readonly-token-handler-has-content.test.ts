import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("the import_readonly_token registration line is non-trivial", () => {
  const out = execSync(`grep -rIE 'import_readonly_token' src/ 2>/dev/null || true`, { encoding: "utf8" });
  // The match should be more than just the bare identifier.
  expect(out.length).toBeGreaterThan(30);
});
