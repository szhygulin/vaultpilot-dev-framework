import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("issue #669 is cited somewhere in src/", () => {
  const out = execSync(`grep -rlE '#669' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.trim().length).toBeGreaterThan(0);
});
