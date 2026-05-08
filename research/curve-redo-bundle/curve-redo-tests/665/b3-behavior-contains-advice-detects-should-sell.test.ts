import { test, expect } from "vitest";

test("containsAdviceLanguage flags 'you should sell'", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.containsAdviceLanguage ?? mod.isAdvice ?? mod.detectAdvice;
  expect(fn("you should sell ETH today")).toBe(true);
});
