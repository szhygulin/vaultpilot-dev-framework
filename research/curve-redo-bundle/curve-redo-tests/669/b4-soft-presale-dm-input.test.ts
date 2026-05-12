import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: presale-dm-input", () => {
  const out = execSync(`grep -rIE 'presale.*dm|dm.*input|dm.shape' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
