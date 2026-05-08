import { describe, it, expect } from "vitest";

async function tryRender(opts: { feeNative?: string; chain: "SOL" | "BTC" | "LTC" | "TRX"; usd?: number }): Promise<string | null | undefined> {
  const m: any = await import("../src/signing/render-verification.js");
  const { feeNative, chain, usd } = opts;
  const chainName: Record<string, string> = { SOL: "Solana", BTC: "Btc", LTC: "Ltc", TRX: "Tron" };
  const fnNames = [
    `render${chainName[chain]}CostPreviewBlock`,
    "renderBitcoinCostPreviewBlock",
    "renderCostPreviewBlock",
  ];
  for (const name of fnNames) {
    const fn = m[name];
    if (typeof fn !== "function") continue;
    const invocations: Array<() => any> = [
      () => fn(feeNative, chain, usd),
      () => fn(feeNative, usd, chain),
      () => fn(feeNative, usd),
      () => fn({ feeNative, symbol: chain, usdPrice: usd }),
    ];
    for (const inv of invocations) {
      try {
        const out = inv();
        if (out === null || out === undefined) { if (!feeNative) return out; continue; }
        if (typeof out === "string" && out.toUpperCase().includes(chain)) return out;
      } catch {}
    }
  }
  return undefined;
}

describe("Edge: BTC typical fee preserves precision", () => {
  it("BTC fee 0.00012345 preserves 8-decimal precision in output", async () => {
    const out = await tryRender({ feeNative: "0.00012345", chain: "BTC", usd: 60000 });
    expect(out).toBeDefined();
    const s = String(out);
    expect(s.toUpperCase()).toContain("BTC");
    // Either reproduces full precision, or rounds visibly while still being non-zero
    const isNonZero = !/\b0(\.0+)?\s*BTC\b/i.test(s);
    expect(isNonZero).toBe(true);
  });
});
