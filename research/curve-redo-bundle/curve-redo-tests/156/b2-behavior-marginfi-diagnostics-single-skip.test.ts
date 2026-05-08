import { test, expect } from "vitest";

test("diagnostics summarize a single skipped bank correctly", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const diag = mod.summarizeMarginfiDiagnostics ?? mod.getMarginfiDiagnostics ?? mod.formatMarginfiDiagnostics;
  if (typeof diag !== "function") {
    expect.fail("diagnostics summarizer export missing");
  }
  const out = await Promise.resolve(
    diag({
      skippedBanks: [
        {
          address: "Be5LNs1111111111111111111111111111111111111",
          mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
          oracleSetup: 15,
          reason: "decode",
        },
      ],
    }),
  );
  const text = typeof out === "string" ? out : JSON.stringify(out);
  // Must mention variant 15 (the new one) somewhere in the summary.
  expect(text).toMatch(/15/);
});
