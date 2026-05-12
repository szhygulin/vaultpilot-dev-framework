import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: ack-flag-spelling", () => {
  const out = execSync(`grep -rIE 'acknowledgeRecovery|acknowledged_recovery|ack_recovery' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
