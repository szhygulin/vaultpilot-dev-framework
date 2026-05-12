import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("server registration/tools includes readonly variant", () => {
  const out = execSync(`grep -rIlE 'readonly_token|readonly_invite|readonly_link' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.split("\n").filter(Boolean).length).toBeGreaterThan(0);
});
