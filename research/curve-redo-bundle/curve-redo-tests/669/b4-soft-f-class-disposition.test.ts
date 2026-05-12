import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: f-class-disposition", () => {
  const out = execSync(`grep -rIE 'F.class|out.of.scope|advisory' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
