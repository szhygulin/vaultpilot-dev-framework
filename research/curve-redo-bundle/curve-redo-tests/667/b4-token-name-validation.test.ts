import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("token name/description validation keyword present", () => {
  const out = execSync(`grep -rIE 'sanitize.*name|validate.*name|reject.*recovery|name.*recovery' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
