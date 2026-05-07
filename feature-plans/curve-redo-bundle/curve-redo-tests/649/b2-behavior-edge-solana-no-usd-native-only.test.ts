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
      () => fn(feeNative, undefined, chain),
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

describe("Edge: Solana native-only fallback when USD unavailable", () => {
  it("render with no usd produces output mentioning SOL but no $", async () => {
    const out = await tryRender({ feeNative: "0.005", chain: "SOL" });
    expect(out).toBeDefined();
    const s = String(out);
    expect(s.toUpperCase()).toContain("SOL");
    expect(s).not.toContain("$");
  });
});
