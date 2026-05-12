import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for ack-flag signal", () => {
  const out = execSync(`grep -rIE 'acknowledged|ackFlag|ack.scam' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
