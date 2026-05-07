import { test, expect } from "vitest";

test("assertNotAdvice error message references advice/policy", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.assertNotAdvice ?? mod.assertNoAdvice ?? mod.assertNeutral;
  let caught: unknown;
  try {
    fn("Buy NVDA right now, guaranteed gains!");
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(Error);
  const msg = String((caught as Error).message).toLowerCase();
  expect(msg).toMatch(/advice|recommend|neutral|policy|disclaim/);
});
