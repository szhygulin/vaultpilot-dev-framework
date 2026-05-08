import { test, expect } from "vitest";

test("attachDisclaimer throws when output to wrap is not a string", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.attachDisclaimer ?? mod.withDisclaimer ?? mod.wrapWithDisclaimer;
  expect(typeof fn).toBe("function");
  expect(() => fn(undefined as any)).toThrow();
  expect(() => fn(null as any)).toThrow();
});
