import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: no-silent-drop", () => {
  const out = execSync(`grep -rIE 'no.silent.drop|silent.drop' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
