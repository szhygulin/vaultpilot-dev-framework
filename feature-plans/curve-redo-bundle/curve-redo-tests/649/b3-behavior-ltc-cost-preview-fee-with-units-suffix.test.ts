import { test, expect, vi } from "vitest";

function asText(r: any): string {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof r === "object" && typeof (r as any).text === "string") return (r as any).text;
  return JSON.stringify(r);
}

test("LTC: feeNative containing unit suffix is sanitized or rejected", async () => {
  vi.resetModules();
  vi.doMock("../src/data/prices.js", () => ({
    getCoinPrice: async () => null,
    getCoinPriceUsd: async () => null,
    getNativePriceUsd: async () => null,
  }));
  const mod: any = await import("../src/signing/render-verification.js");
  const render = mod.renderCostPreviewBlock;

  const tx: any = { chain: "litecoin", kind: "ltc-send", to: "ltc1", amount: "0.5", feeNative: "0.0001 LTC" };
  let err: unknown; let r1: any;
  try { r1 = await render(tx); } catch (e) { err = e; }
  expect(err).toBeUndefined();
  expect(asText(r1)).not.toMatch(/LTC[\s\u00a0]+LTC/);
  expect(asText(r1)).not.toMatch(/NaN/);

  const valid: any = { ...tx, feeNative: "0.0001" };
  const r2 = await render(valid);
  expect(asText(r2)).toMatch(/\bLTC\b/);
});
