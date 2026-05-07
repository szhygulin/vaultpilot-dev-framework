import { test, expect } from "vitest";

test("diagnostics group skipped banks by variant and report 3 for 15 / 4 for 16", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const diag = mod.summarizeMarginfiDiagnostics ?? mod.getMarginfiDiagnostics ?? mod.formatMarginfiDiagnostics;
  if (typeof diag !== "function") {
    expect.fail("diagnostics summarizer export missing");
  }
  const skippedBanks = [
    { address: "Be5LNs1", mint: "USDC", oracleSetup: 15, reason: "decode" },
    { address: "6SUMng1", mint: "USDT", oracleSetup: 15, reason: "decode" },
    { address: "EtWUqS1", mint: "unknown", oracleSetup: 15, reason: "decode" },
    { address: "4cSk2p1", mint: "SOL", oracleSetup: 16, reason: "decode" },
    { address: "8J7nwj1", mint: "USDS", oracleSetup: 16, reason: "decode" },
    { address: "hLkUhG1", mint: "JupSOL", oracleSetup: 16, reason: "decode" },
    { address: "ATNeEj1", mint: "unknown", oracleSetup: 16, reason: "decode" },
  ];
  const out = await Promise.resolve(diag({ skippedBanks }));
  const text = typeof out === "string" ? out : JSON.stringify(out);
  // The exact format may vary, but BOTH counts and BOTH variants must appear.
  expect(text).toMatch(/15/);
  expect(text).toMatch(/16/);
  expect(text).toMatch(/\b3\b/);
  expect(text).toMatch(/\b4\b/);
});
