import { describe, it, expect } from "vitest";

async function tryRender(opts: { feeNative?: string; chain: "SOL" | "BTC" | "LTC" | "TRX"; usd?: number }): Promise<string | null | undefined> {
  const m: any = await import("../src/signing/render-verification.js");
  const { feeNative, chain, usd } = opts;
  const chainName: Record<string, string> = { SOL: "Solana", BTC: "Btc", LTC: "Ltc", TRX: "Tron" };
  const fnNames = [
    `render${chainName[chain]}CostPreviewBlock`,
    "renderTrxCostPreviewBlock",
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

describe("Edge: TRON cost preview silent on undefined fee", () => {
  it("undefined feeNative for TRX produces no preview block", async () => {
    const positive = await tryRender({ feeNative: "5", chain: "TRX", usd: 0.1 });
    expect(positive).toBeDefined();
    expect(typeof positive).toBe("string");
    expect(String(positive).toUpperCase()).toContain("TRX");

    const silent = await tryRender({ feeNative: undefined, chain: "TRX", usd: 0.1 });
    const isSilent = silent === null || silent === undefined || silent === "";
    expect(isSilent).toBe(true);
  });
});
