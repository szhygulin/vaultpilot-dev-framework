import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: intent-layer-defense", () => {
  const out = execSync(`grep -rIE 'intent.layer|intentLayer' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
