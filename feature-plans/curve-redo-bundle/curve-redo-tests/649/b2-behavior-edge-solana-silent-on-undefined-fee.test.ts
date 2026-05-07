import { describe, it, expect } from "vitest";

async function tryRender(opts: { feeNative?: string; chain: "SOL" | "BTC" | "LTC" | "TRX"; usd?: number }): Promise<string | null | undefined> {
  const m: any = await import("../src/signing/render-verification.js");
  const { feeNative, chain, usd } = opts;
  const chainName: Record<string, string> = { SOL: "Solana", BTC: "Btc", LTC: "Ltc", TRX: "Tron" };
  const fnNames = [
    `render${chainName[chain]}CostPreviewBlock`,
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
        return out;
      } catch {}
    }
  }
  return undefined;
}

describe("Edge: Solana cost preview silent on undefined fee", () => {
  it("undefined feeNative for SOL produces no preview block", async () => {
    // Establish positive baseline first
    const positive = await tryRender({ feeNative: "0.005", chain: "SOL", usd: 100 });
    expect(positive).toBeDefined();
    expect(typeof positive).toBe("string");
    expect(String(positive).toUpperCase()).toContain("SOL");

    // Now check silent on missing
    const silent = await tryRender({ feeNative: undefined, chain: "SOL", usd: 100 });
    const isSilent = silent === null || silent === undefined || silent === "";
    expect(isSilent).toBe(true);
  });
});
