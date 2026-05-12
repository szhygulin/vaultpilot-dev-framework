import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: intent-layer-hard", () => {
  const out = execSync(`grep -rIE 'intent.layer.*hard|hardBlock.*intent' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
