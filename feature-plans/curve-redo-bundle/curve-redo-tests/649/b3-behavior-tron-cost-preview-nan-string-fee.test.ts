import { test, expect, vi } from "vitest";

function asText(r: any): string {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof r === "object" && typeof (r as any).text === "string") return (r as any).text;
  return JSON.stringify(r);
}

test("TRON: literal 'NaN' feeNative is rejected and never rendered as a fee", async () => {
  vi.resetModules();
  vi.doMock("../src/data/prices.js", () => ({
    getCoinPrice: async () => null,
    getCoinPriceUsd: async () => null,
    getNativePriceUsd: async () => null,
  }));
  const mod: any = await import("../src/signing/render-verification.js");
  const render = mod.renderCostPreviewBlock;

  const tx: any = { chain: "tron", kind: "tron-trx-transfer", to: "TLs", amount: "1", feeNative: "NaN" };
  let err: unknown; let r1: any;
  try { r1 = await render(tx); } catch (e) { err = e; }
  expect(err).toBeUndefined();
  expect(asText(r1)).not.toMatch(/NaN[\s\u00a0]*TRX/i);

  const valid: any = { ...tx, feeNative: "0.99" };
  const r2 = await render(valid);
  expect(asText(r2)).toMatch(/TRX/);
});
