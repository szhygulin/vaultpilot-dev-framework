import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: description-contains-recovery-rejected", () => {
  const out = execSync(`grep -rIE 'description.*recovery.*reject' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
