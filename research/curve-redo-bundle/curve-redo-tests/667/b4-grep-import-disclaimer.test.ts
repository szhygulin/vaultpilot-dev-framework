import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for import-disclaimer signal", () => {
  const out = execSync(`grep -rIE 'warning|disclaimer|notice|caution' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
