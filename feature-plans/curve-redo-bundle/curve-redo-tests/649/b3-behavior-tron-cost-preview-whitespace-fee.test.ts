import { test, expect, vi } from "vitest";

function asText(r: any): string {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof r === "object" && typeof (r as any).text === "string") return (r as any).text;
  return JSON.stringify(r);
}

test("TRON: whitespace feeNative does not produce malformed preview", async () => {
  vi.resetModules();
  vi.doMock("../src/data/prices.js", () => ({
    getCoinPrice: async () => null,
    getCoinPriceUsd: async () => null,
    getNativePriceUsd: async () => null,
  }));
  const mod: any = await import("../src/signing/render-verification.js");
  const render = mod.renderCostPreviewBlock;

  const tx: any = { chain: "tron", kind: "tron-trx-transfer", to: "TLs", amount: "1", feeNative: "   " };
  let err: unknown; let r1: any;
  try { r1 = await render(tx); } catch (e) { err = e; }
  expect(err).toBeUndefined();
  // Must not render NaN, undefined, or the whitespace itself as a fee
  expect(asText(r1)).not.toMatch(/NaN/);
  expect(asText(r1)).not.toMatch(/undefined/i);

  const valid: any = { ...tx, feeNative: "0.7" };
  const r2 = await render(valid);
  expect(asText(r2)).toMatch(/TRX/);
});
