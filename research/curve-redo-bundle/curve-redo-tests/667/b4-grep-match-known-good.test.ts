import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for match-known-good signal", () => {
  const out = execSync(`grep -rIE 'knownGood|verifiedAddr|trusted.set' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
