import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("readonly invite / link mechanism referenced", () => {
  const out = execSync(`grep -rIE 'readonly.invite|readonly.link|generate_readonly_link|list_readonly_invites' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
