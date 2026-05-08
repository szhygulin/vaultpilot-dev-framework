import { describe, it, expect } from "vitest";

async function callRender(opts: { feeNative?: string; chain: "SOL" | "BTC" | "LTC" | "TRX"; usd?: number }): Promise<any> {
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
      try { return inv(); } catch {}
    }
  }
  throw new Error("no compatible render function found");
}

describe("Edge: BTC zero fee boundary", () => {
  it("feeNative='0' for BTC produces clean output, either silent or '0 BTC'", async () => {
    const positive = await callRender({ feeNative: "0.0001", chain: "BTC", usd: 60000 });
    expect(typeof positive).toBe("string");
    expect(String(positive).toUpperCase()).toContain("BTC");

    const out = await callRender({ feeNative: "0", chain: "BTC", usd: 60000 });
    if (out === null || out === undefined || out === "") {
      expect(true).toBe(true);
    } else {
      const s = String(out);
      expect(s).not.toContain("NaN");
      expect(s).not.toContain("undefined");
      expect(s.toUpperCase()).toContain("BTC");
    }
  });
});
