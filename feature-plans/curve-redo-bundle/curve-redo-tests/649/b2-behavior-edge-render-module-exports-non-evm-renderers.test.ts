import { describe, it, expect } from "vitest";

describe("Edge: render-verification module exposes non-EVM cost preview surface", () => {
  it("at least one chain-specific or generalized cost preview render is available", async () => {
    const m: any = await import("../src/signing/render-verification.js");
    // After the fix, either:
    //  (a) generalized renderCostPreviewBlock that accepts a chain symbol (returns chain-specific output), OR
    //  (b) chain-specific exports for at least Solana / BTC / LTC / TRON
    const hasChainSpecific =
      typeof m.renderSolanaCostPreviewBlock === "function" ||
      typeof m.renderBtcCostPreviewBlock === "function" ||
      typeof m.renderBitcoinCostPreviewBlock === "function" ||
      typeof m.renderLtcCostPreviewBlock === "function" ||
      typeof m.renderLitecoinCostPreviewBlock === "function" ||
      typeof m.renderTronCostPreviewBlock === "function" ||
      typeof m.renderTrxCostPreviewBlock === "function";

    let generalizedHandlesSol = false;
    if (typeof m.renderCostPreviewBlock === "function") {
      const fn = m.renderCostPreviewBlock;
      const tries = [
        () => fn("0.005", "SOL", 100),
        () => fn("0.005", 100, "SOL"),
        () => fn({ feeNative: "0.005", symbol: "SOL", usdPrice: 100 }),
      ];
      for (const t of tries) {
        try {
          const out = t();
          if (typeof out === "string" && out.toUpperCase().includes("SOL")) {
            generalizedHandlesSol = true;
            break;
          }
        } catch {}
      }
    }

    expect(hasChainSpecific || generalizedHandlesSol).toBe(true);
  });
});
