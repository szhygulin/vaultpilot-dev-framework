import { test, expect } from "vitest";

test("attachDisclaimer on empty body still emits the disclaimer text", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.attachDisclaimer ?? mod.withDisclaimer ?? mod.wrapWithDisclaimer;
  const out = fn("");
  expect(typeof out).toBe("string");
  expect(out.length).toBeGreaterThan(0);
  expect(out.toLowerCase()).toMatch(/not\s+(?:a\s+source\s+of\s+)?(?:financial|investment)\s+advice|no\s+financial\s+advice/);
});
