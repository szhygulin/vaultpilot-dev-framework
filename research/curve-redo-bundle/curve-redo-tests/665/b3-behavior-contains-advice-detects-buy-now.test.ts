import { test, expect } from "vitest";

test("containsAdviceLanguage flags imperative 'buy now'", async () => {
  const mod: any = await import("../src/legal/disclaimer.js");
  const fn = mod.containsAdviceLanguage ?? mod.isAdvice ?? mod.detectAdvice;
  expect(typeof fn).toBe("function");
  expect(fn("buy now or you'll regret it")).toBe(true);
});
