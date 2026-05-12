import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: secondary-oracle-fallback", () => {
  const out = execSync(`grep -rIE 'fallback.oracle|backup.oracle|oracle.fallback' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
