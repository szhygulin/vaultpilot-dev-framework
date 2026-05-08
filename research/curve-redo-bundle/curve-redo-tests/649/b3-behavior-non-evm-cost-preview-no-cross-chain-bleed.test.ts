import { test, expect, vi } from "vitest";

function asText(r: any): string {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof r === "object" && typeof (r as any).text === "string") return (r as any).text;
  return JSON.stringify(r);
}

test("Each non-EVM chain renders only its own native unit, never ETH", async () => {
  vi.resetModules();
  vi.doMock("../src/data/prices.js", () => ({
    getCoinPrice: async () => null,
    getCoinPriceUsd: async () => null,
    getNativePriceUsd: async () => null,
  }));
  const mod: any = await import("../src/signing/render-verification.js");
  const render = mod.renderCostPreviewBlock;
  expect(typeof render).toBe("function");

  const cases: Array<{ chain: string; kind: string; sym: RegExp }> = [
    { chain: "tron", kind: "tron-trx-transfer", sym: /\bTRX\b/ },
    { chain: "solana", kind: "solana-transfer", sym: /\bSOL\b/ },
    { chain: "btc", kind: "btc-send", sym: /\bBTC\b/ },
    { chain: "litecoin", kind: "ltc-send", sym: /\bLTC\b/ },
  ];

  for (const c of cases) {
    const tx: any = { chain: c.chain, kind: c.kind, to: "x", amount: "1", feeNative: "0.001" };
    const out = await render(tx);
    const text = asText(out);
    // Discriminator: each non-EVM chain's preview surfaces its own native unit
    expect(text).toMatch(c.sym);
    // Negative: never accidentally bleed the EVM unit into a non-EVM block
    expect(text).not.toMatch(/\bETH\b/);
    expect(text).not.toMatch(/\bgwei\b/i);
  }
});
