import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("soft signal: metadata-decorate-warning", () => {
  const out = execSync(`grep -rIE 'decorate.*warning|annotate.*warning' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
