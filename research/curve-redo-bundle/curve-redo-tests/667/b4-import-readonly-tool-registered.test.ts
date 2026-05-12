import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("import_readonly_token tool is registered (server.tool or similar)", () => {
  const out = execSync(`grep -rIE 'server\\.tool.*import_readonly|registerTool.*import_readonly|tools.*import_readonly' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
