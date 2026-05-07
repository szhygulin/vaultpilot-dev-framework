import { test, expect, vi } from "vitest";

function asText(r: any): string {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof r === "object" && typeof (r as any).text === "string") return (r as any).text;
  return JSON.stringify(r);
}

test("TRON: missing feeNative yields no preview, valid feeNative renders TRX", async () => {
  vi.resetModules();
  vi.doMock("../src/data/prices.js", () => ({
    getCoinPrice: async () => null,
    getCoinPriceUsd: async () => null,
    getNativePriceUsd: async () => null,
  }));
  const mod: any = await import("../src/signing/render-verification.js");
  const render = mod.renderCostPreviewBlock;
  expect(typeof render).toBe("function");

  const txNoFee: any = { chain: "tron", kind: "tron-trx-transfer", from: "TVk", to: "TLs", amount: "1", asset: "TRX" };
  let err: unknown;
  let r1: any;
  try { r1 = await render(txNoFee); } catch (e) { err = e; }
  expect(err).toBeUndefined();
  expect(asText(r1)).not.toMatch(/network fee|estimated/i);

  const txWithFee: any = { ...txNoFee, feeNative: "0.345" };
  const r2 = await render(txWithFee);
  expect(asText(r2)).toMatch(/TRX/);
});
