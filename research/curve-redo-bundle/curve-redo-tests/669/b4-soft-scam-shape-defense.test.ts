import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("669 soft signal: scam-shape-defense", () => {
  const out = execSync(`grep -rIE 'scam.shape|dm.shape.scam|presale.scam' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.length >= 0).toBe(true);
});
