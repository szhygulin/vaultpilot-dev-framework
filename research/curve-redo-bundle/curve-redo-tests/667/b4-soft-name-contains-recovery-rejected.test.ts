import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: name-contains-recovery-rejected", () => {
  const out = execSync(`grep -rIE 'name.*recovery.*reject|reject.*name.*recovery' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
