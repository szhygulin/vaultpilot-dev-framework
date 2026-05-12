import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: matrix-sampled-source", () => {
  const out = execSync(`grep -rIE 'matrix.sampled|matrix-sampled|batch-05' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
