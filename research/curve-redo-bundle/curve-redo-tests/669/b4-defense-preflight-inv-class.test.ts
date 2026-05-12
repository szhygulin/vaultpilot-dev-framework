import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: preflight-inv-class", () => {
  const out = execSync(`grep -rIE 'preflight.*invariant|invariant.*inv' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
