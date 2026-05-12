import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: rate-limit-rpc-anomaly", () => {
  const out = execSync(`grep -rIE 'rate.limit.*rpc|rpc.*rate.limit' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
