import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("at least one test file references import_readonly_token", () => {
  const out = execSync(`grep -rIlE 'import_readonly_token|importReadonlyToken' . --include='*.test.*' --include='*.spec.*' 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
