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

describe("Edge: Solana smallest unit (1 lamport)", () => {
  it("renders without collapsing to 0 SOL", async () => {
    const out = await tryRender({ feeNative: "0.000000001", chain: "SOL" });
    expect(out).toBeDefined();
    const s = String(out);
    expect(s.toUpperCase()).toContain("SOL");
    // Either preserves full precision or shows it as a non-trivial value
    const collapsedToZero = /\b0(\.0+)?\s*SOL\b/i.test(s) && !s.includes("0.000000001");
    expect(collapsedToZero).toBe(false);
  });
});
