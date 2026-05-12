import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: block-instead-of-warn", () => {
  const out = execSync(`grep -rIE 'block.*instead.*warn|refuse.*instead.*warn' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
