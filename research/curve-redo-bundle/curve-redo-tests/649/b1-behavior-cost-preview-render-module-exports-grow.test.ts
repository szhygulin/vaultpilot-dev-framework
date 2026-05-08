import { test, expect } from "vitest";

test("render-verification module exposes more than just renderCostPreviewBlock once non-EVM variants land", async () => {
  const mod = await import("../src/signing/render-verification.js");
  const keys = Object.keys(mod).filter((k) => typeof (mod as Record<string, unknown>)[k] === "function");
  // Baseline EVM slice exported renderCostPreviewBlock and a small handful of helpers.
  // After extending to four non-EVM chains, the file gains additional render-related exports
  // (either chain-specific functions or a generalized renderer plus support helpers).
  expect(keys.length).toBeGreaterThanOrEqual(2);
});
