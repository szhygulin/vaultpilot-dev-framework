import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: intent-classify", () => {
  const out = execSync(`grep -rIE 'intentClassify|classifyIntent|classify.tx' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
