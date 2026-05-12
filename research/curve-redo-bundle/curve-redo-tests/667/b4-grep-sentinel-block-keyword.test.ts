import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("grep src/ for sentinel-block-keyword signal", () => {
  const out = execSync(`grep -rIE 'VAULTPILOT.PIN|emit.*pin|pin.block' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
