import { test, expect } from "vitest";

test("wrapWithDisclaimer preserves the original input substring", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const original = "BTC trades at 60k USD as of today.";
  const wrapped = mod.wrapWithDisclaimer(original);
  expect(typeof wrapped).toBe("string");
  expect((wrapped as string)).toContain(original);
});
