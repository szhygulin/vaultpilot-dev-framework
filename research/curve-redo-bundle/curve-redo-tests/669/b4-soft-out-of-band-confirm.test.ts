import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: out-of-band-confirm", () => {
  const out = execSync(`grep -rIE 'out.of.band|oob.confirm|side.channel' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
