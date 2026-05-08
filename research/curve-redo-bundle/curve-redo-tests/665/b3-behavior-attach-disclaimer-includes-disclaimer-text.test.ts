import { test, expect } from "vitest";

test("attachDisclaimer always embeds the disclaimer text in the result", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.attachDisclaimer ?? mod.withDisclaimer ?? mod.wrapWithDisclaimer;
  const out = fn("BTC price is 65000");
  expect(typeof out).toBe("string");
  expect(out.toLowerCase()).toMatch(/not\s+(?:a\s+source\s+of\s+)?(?:financial|investment)\s+advice|no\s+financial\s+advice/);
});
