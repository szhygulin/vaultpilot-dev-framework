import { test, expect } from "vitest";

test("diagnostics deduplicate a duplicated skipped-bank record", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const diag = mod.summarizeMarginfiDiagnostics ?? mod.getMarginfiDiagnostics ?? mod.formatMarginfiDiagnostics;
  if (typeof diag !== "function") {
    expect.fail("diagnostics summarizer export missing");
  }
  const dup = {
    address: "Be5LNs1111111111111111111111111111111111111",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    oracleSetup: 15,
    reason: "decode",
  };
  const out = await Promise.resolve(diag({ skippedBanks: [dup, dup] }));
  const text = typeof out === "string" ? out : JSON.stringify(out);
  // The address should appear meaningfully but the count of unique banks should still be 1
  // when surfaced as a tally.
  if (/\b\d+\s*(banks?|skipp)/i.test(text)) {
    expect(text).not.toMatch(/\b2\s*banks?\b/i);
  }
});
