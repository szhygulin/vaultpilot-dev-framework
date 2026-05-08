import { test, expect, vi } from "vitest";

function asText(r: any): string {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof r === "object" && typeof (r as any).text === "string") return (r as any).text;
  return JSON.stringify(r);
}

test("BTC: feeNative with embedded units string is sanitized or rejected", async () => {
  vi.resetModules();
  vi.doMock("../src/data/prices.js", () => ({
    getCoinPrice: async () => null,
    getCoinPriceUsd: async () => null,
    getNativePriceUsd: async () => null,
  }));
  const mod: any = await import("../src/signing/render-verification.js");
  const render = mod.renderCostPreviewBlock;

  // feeNative is supposed to be a bare numeric string per the issue contract.
  // The renderer must not echo back "BTC BTC" duplication or render NaN.
  const tx: any = { chain: "btc", kind: "btc-send", to: "bc1q", amount: "0.001", feeNative: "0.0001 BTC" };
  let err: unknown; let r1: any;
  try { r1 = await render(tx); } catch (e) { err = e; }
  expect(err).toBeUndefined();
  expect(asText(r1)).not.toMatch(/BTC[\s\u00a0]+BTC/);
  expect(asText(r1)).not.toMatch(/NaN/);

  const valid: any = { ...tx, feeNative: "0.0001" };
  const r2 = await render(valid);
  expect(asText(r2)).toMatch(/\bBTC\b/);
});
