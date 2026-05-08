import { describe, it, expect } from "vitest";

async function tryRender(opts: { feeNative?: string; chain: "SOL" | "BTC" | "LTC" | "TRX"; usd?: number }): Promise<string | null | undefined> {
  const m: any = await import("../src/signing/render-verification.js");
  const { feeNative, chain, usd } = opts;
  const chainName: Record<string, string> = { SOL: "Solana", BTC: "Btc", LTC: "Ltc", TRX: "Tron" };
  const fnNames = [
    `render${chainName[chain]}CostPreviewBlock`,
    "renderTrxCostPreviewBlock",
    "renderLitecoinCostPreviewBlock",
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

describe("Edge: TRON & LTC handle large fee values cleanly", () => {
  it("TRX 1000 fee renders without NaN/overflow", async () => {
    const out = await tryRender({ feeNative: "1000", chain: "TRX", usd: 0.1 });
    expect(out).toBeDefined();
    const s = String(out);
    expect(s.toUpperCase()).toContain("TRX");
    expect(s).not.toContain("NaN");
    expect(s).not.toContain("Infinity");
    expect(s).toContain("1000");
  });

  it("LTC 50 fee renders without NaN/overflow", async () => {
    const out = await tryRender({ feeNative: "50", chain: "LTC", usd: 80 });
    expect(out).toBeDefined();
    const s = String(out);
    expect(s.toUpperCase()).toContain("LTC");
    expect(s).not.toContain("NaN");
    expect(s).not.toContain("Infinity");
    expect(s).toContain("50");
  });
});
