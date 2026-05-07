import { test, expect } from "vitest";

test("wrapWithDisclaimer tolerates a very large input string", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const big = "x".repeat(20_000);
  let out: unknown;
  expect(() => { out = mod.wrapWithDisclaimer(big); }).not.toThrow();
  expect(typeof out).toBe("string");
  expect((out as string).length).toBeGreaterThanOrEqual(big.length);
});
