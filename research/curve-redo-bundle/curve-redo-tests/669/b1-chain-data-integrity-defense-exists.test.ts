// Issue #669 — Rogue RPC chain-data integrity gap. Aspirational: the fix
// adds SOME form of chain-data corroboration / sanity check / out-of-band
// validation. Options listed in the issue: secondary RPC oracle, rate-of-
// change sanity, OOB confirmation, known-scam-pattern matcher. Tests look
// for indicators of any of these.
import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("source has a chain-data integrity / RPC corroboration mechanism", () => {
  const out = execSync(
    `grep -rlE 'secondary.RPC|RPC.corroborat|cross-RPC|chain.data.integrity|scam.pattern|rogue.RPC|rate.of.change|OOB.*confirm|out.of.band' src/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  expect(out.trim().length).toBeGreaterThan(0);
});
