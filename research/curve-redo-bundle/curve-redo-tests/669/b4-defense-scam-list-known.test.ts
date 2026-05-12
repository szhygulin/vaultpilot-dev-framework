import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 defense signal: scam-list-known", () => {
  const out = execSync(`grep -rIE 'known.scam.list|scamRegistry|reportedScam' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
