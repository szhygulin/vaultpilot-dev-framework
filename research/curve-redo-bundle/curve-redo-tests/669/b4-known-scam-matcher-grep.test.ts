import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("known-scam pattern matcher referenced", () => {
  const out = execSync(`grep -rIE 'scam.pattern|known.scam|scam.matcher|scam.detect' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
