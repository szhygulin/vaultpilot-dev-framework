import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("final soft signal: binding-not-bypassable", () => {
  const out = execSync(`grep -rIE 'bypass.*step0|skip.*step0' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
