import { test, expect } from "vitest";

test("skipped-bank record exposes address, mint, and oracleSetup variant", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const SkipShape = mod.SkippedBankSchema ?? mod.SkippedBankRecord ?? null;
  // We only assert the shape obliquely via a sample record.
  const sample = {
    address: "Be5LNs1111111111111111111111111111111111111",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    oracleSetup: 15,
    reason: "decode",
  };
  if (SkipShape && typeof SkipShape.parse === "function") {
    expect(() => SkipShape.parse(sample)).not.toThrow();
  }
  // Otherwise, the diagnostics summarizer must accept this exact shape.
  const diag = mod.summarizeMarginfiDiagnostics ?? mod.getMarginfiDiagnostics ?? mod.formatMarginfiDiagnostics;
  if (typeof diag === "function") {
    const out = await Promise.resolve(diag({ skippedBanks: [sample] }));
    const text = typeof out === "string" ? out : JSON.stringify(out);
    expect(text).toMatch(/15/);
    expect(text.toLowerCase()).toContain("decode");
  } else {
    expect.fail("need either SkippedBankSchema or diagnostics summarizer");
  }
});
