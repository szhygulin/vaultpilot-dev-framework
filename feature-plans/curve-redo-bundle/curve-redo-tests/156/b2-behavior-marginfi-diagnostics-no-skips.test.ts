import { test, expect } from "vitest";

test("diagnostics report empty skip list when all banks decoded cleanly", async () => {
  const mod: any = await import("../src/modules/solana/marginfi.js").catch(() => ({}));
  const diag = mod.summarizeMarginfiDiagnostics ?? mod.getMarginfiDiagnostics ?? mod.formatMarginfiDiagnostics;
  if (typeof diag !== "function") {
    expect.fail("diagnostics summarizer export missing");
  }
  const out = await Promise.resolve(diag({ skippedBanks: [] }));
  const text = typeof out === "string" ? out : JSON.stringify(out);
  // Should NOT mention variant 15 or 16 when there are no skips.
  expect(text).not.toMatch(/variant\s*1[56]/i);
});
