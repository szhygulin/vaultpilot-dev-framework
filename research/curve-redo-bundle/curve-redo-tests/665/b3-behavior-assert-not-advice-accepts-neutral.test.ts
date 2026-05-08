import { test, expect } from "vitest";

test("assertNotAdvice does not throw on neutral factual text", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.assertNotAdvice ?? mod.assertNoAdvice ?? mod.assertNeutral;
  expect(() => fn("BTC closed at 65,000 USD on 2026-05-06.")).not.toThrow();
});
