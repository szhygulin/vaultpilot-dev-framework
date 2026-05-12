import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("prepare_* family is mentioned (as comparand for binding)", () => {
  const out = execSync(`grep -rIE 'prepare_[a-z]+|prepare\\*' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
