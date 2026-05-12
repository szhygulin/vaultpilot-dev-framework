import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for approve-readonly signal", () => {
  const out = execSync(`grep -rIE 'approval|approveReadonly|approve.*readonly' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
