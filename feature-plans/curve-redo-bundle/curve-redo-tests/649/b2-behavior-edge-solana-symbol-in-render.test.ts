import { describe, it, expect } from "vitest";

async function tryRender(opts: { feeNative?: string; chain: "SOL" | "BTC" | "LTC" | "TRX"; usd?: number }): Promise<string | null | undefined> {
  const m: any = await import("../src/signing/render-verification.js");
  const { feeNative, chain, usd } = opts;
  const chainName: Record<string, string> = { SOL: "Solana", BTC: "Btc", LTC: "Ltc", TRX: "Tron" };
  const fnNames = [
    `render${chainName[chain]}CostPreviewBlock`,
    `render${chainName[chain]}CostPreview`,
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
      () => fn({ feeNative, usdPrice: usd }),
    ];
    for (const inv of invocations) {
      try {
        const out = inv();
        if (out === null || out === undefined) {
          if (!feeNative) return out;
          continue;
        }
        if (typeof out === "string") {
          if (out.toUpperCase().includes(chain)) return out;
          if (out.length === 0 && !feeNative) return out;
        }
      } catch {}
    }
  }
  return undefined;
}

describe("Edge: Solana cost preview renders SOL symbol", () => {
  it("rendered output for Solana fee mentions SOL and not ETH", async () => {
    const out = await tryRender({ feeNative: "0.005", chain: "SOL", usd: 100 });
    expect(out).toBeDefined();
    expect(typeof out).toBe("string");
    const s = String(out);
    expect(s.toUpperCase()).toContain("SOL");
    // baseline EVM-only render would either return null or emit ETH
    expect(/\bETH\b/i.test(s)).toBe(false);
  });
});
