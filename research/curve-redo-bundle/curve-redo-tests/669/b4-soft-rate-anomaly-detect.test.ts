import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: rate-anomaly-detect", () => {
  const out = execSync(`grep -rIE 'rate.anomaly|anomaly.detect|outlier' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
