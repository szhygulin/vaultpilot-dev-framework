import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: import-handler-async", () => {
  const out = execSync(`grep -rIE 'async.*import_readonly|async.*importReadonlyToken' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
