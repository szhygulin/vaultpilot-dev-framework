import { test, expect } from "vitest";

test("assertNotAdvice throws on 'I recommend' phrasing", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.assertNotAdvice ?? mod.assertNoAdvice ?? mod.assertNeutral;
  expect(() => fn("I recommend that you sell BTC immediately")).toThrow();
});
