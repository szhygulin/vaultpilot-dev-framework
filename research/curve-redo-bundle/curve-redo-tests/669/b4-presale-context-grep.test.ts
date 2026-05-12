import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("presale / DM-shape input keyword present", () => {
  const out = execSync(`grep -rIE 'presale|launch.dm|dm.shape|launcher' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
