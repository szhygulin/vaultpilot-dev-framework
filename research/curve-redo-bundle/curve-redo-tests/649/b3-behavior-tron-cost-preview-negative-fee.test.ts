import { test, expect, vi } from "vitest";

function asText(r: any): string {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof r === "object" && typeof (r as any).text === "string") return (r as any).text;
  return JSON.stringify(r);
}

test("TRON: negative feeNative does not appear as a negative fee in the preview", async () => {
  vi.resetModules();
  vi.doMock("../src/data/prices.js", () => ({
    getCoinPrice: async () => null,
    getCoinPriceUsd: async () => null,
    getNativePriceUsd: async () => null,
  }));
  const mod: any = await import("../src/signing/render-verification.js");
  const render = mod.renderCostPreviewBlock;

  const tx: any = { chain: "tron", kind: "tron-trx-transfer", to: "TLs", amount: "1", feeNative: "-2.5" };
  let err: unknown; let r1: any;
  try { r1 = await render(tx); } catch (e) { err = e; }
  expect(err).toBeUndefined();
  // No "-2.5 TRX" or similar negative-fee rendering
  expect(asText(r1)).not.toMatch(/-2\.5/);

  const valid: any = { ...tx, feeNative: "2.5" };
  const r2 = await render(valid);
  expect(asText(r2)).toMatch(/TRX/);
});
