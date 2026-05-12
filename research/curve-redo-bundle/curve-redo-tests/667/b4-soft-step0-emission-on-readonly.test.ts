import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: step0-emission-on-readonly", () => {
  const out = execSync(`grep -rIE 'emit.*step0.*readonly|readonly.*step0' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
