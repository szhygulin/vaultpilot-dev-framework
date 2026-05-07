import { test, expect, vi } from "vitest";

function asText(r: any): string {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  if (typeof r === "object" && typeof (r as any).text === "string") return (r as any).text;
  return JSON.stringify(r);
}

test("Solana: whitespace feeNative is silent, no NaN leakage", async () => {
  vi.resetModules();
  vi.doMock("../src/data/prices.js", () => ({
    getCoinPrice: async () => null,
    getCoinPriceUsd: async () => null,
    getNativePriceUsd: async () => null,
  }));
  const mod: any = await import("../src/signing/render-verification.js");
  const render = mod.renderCostPreviewBlock;

  const tx: any = { chain: "solana", kind: "solana-transfer", to: "def", amount: "1", feeNative: "\t " };
  let err: unknown; let r1: any;
  try { r1 = await render(tx); } catch (e) { err = e; }
  expect(err).toBeUndefined();
  expect(asText(r1)).not.toMatch(/NaN/);

  const valid: any = { ...tx, feeNative: "0.000007" };
  const r2 = await render(valid);
  expect(asText(r2)).toMatch(/\bSOL\b/);
});
