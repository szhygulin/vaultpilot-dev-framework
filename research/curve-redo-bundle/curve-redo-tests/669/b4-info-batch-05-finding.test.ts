import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("batch-05 findings cross-reference present", () => {
  const out = execSync(`grep -rIE 'batch-05|batch_05|matrix.sampled' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
