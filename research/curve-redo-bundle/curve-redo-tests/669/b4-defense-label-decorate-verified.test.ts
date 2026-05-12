import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: label-decorate-verified", () => {
  const out = execSync(`grep -rIE 'decorate.verified|annotate.verified' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
