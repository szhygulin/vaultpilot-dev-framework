import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("VAULTPILOT PIN sentinel emission referenced", () => {
  const out = execSync(`grep -rIE 'VAULTPILOT.PIN|emit.*pin|pinBlock' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length).toBeGreaterThan(0);
});
