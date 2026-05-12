import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("import_readonly_token tool name is referenced in src/", () => {
  const out = execSync(`grep -rlE 'import_readonly_token|importReadonlyToken' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.trim().length).toBeGreaterThan(0);
});
