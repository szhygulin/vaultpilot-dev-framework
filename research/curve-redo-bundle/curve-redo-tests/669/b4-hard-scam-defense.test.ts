import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 hard grep: scam-defense present in src/", () => {
  const out = execSync(`grep -rIE 'scam|malicious|phish' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
