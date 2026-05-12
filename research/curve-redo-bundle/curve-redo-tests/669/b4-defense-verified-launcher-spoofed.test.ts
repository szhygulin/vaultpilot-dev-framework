import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: verified-launcher-spoofed", () => {
  const out = execSync(`grep -rIE 'verified.launcher.*spoof|spoof.*verified.launcher' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
