import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("source mentions scam-pattern matching or rate-of-change sanity", () => {
  const out = execSync(
    `grep -rIE 'scam.pattern|rate.of.change|sanity.check|presale.scam|risk.score.*spoof' src/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  // Soft pass: any indicator that one of the listed mechanisms exists.
  // The mechanism doesn't have to be all four — any one is sufficient.
  expect(out.trim().length).toBeGreaterThan(0);
});
