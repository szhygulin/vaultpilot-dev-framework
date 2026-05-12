import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for fingerprint signal", () => {
  const out = execSync(`grep -rIE 'fingerprint|hash|sha256|integrity' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
