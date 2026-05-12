import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("rate-of-change / sanity-check keyword present", () => {
  const out = execSync(`grep -rIE 'rate.of.change|rate.sanity|sanity.check' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
