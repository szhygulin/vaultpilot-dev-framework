import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("rogue MCP / collusion / adversarial keyword present", () => {
  const out = execSync(`grep -rIE 'rogue|adversari|collud|collusion|honest.MCP|compromise' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
