import { test, expect } from "vitest";

test("diagnostics list both variant 15 and 16 when both are observed", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const diag = mod.summarizeMarginfiDiagnostics ?? mod.getMarginfiDiagnostics ?? mod.formatMarginfiDiagnostics;
  if (typeof diag !== "function") {
    expect.fail("diagnostics summarizer export missing");
  }
  const out = await Promise.resolve(
    diag({
      skippedBanks: [
        { address: "Be5LNs1111111111111111111111111111111111111", mint: "USDC", oracleSetup: 15, reason: "decode" },
        { address: "4cSk2p1111111111111111111111111111111111111", mint: "SOL", oracleSetup: 16, reason: "decode" },
      ],
    }),
  );
  const text = typeof out === "string" ? out : JSON.stringify(out);
  expect(text).toMatch(/15/);
  expect(text).toMatch(/16/);
});
