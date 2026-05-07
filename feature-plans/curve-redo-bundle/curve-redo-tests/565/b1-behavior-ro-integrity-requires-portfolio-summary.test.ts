import { test, expect } from "vitest";

test("requiresDataSource returns true for get_portfolio_summary", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  expect(Boolean(mod.requiresDataSource("get_portfolio_summary"))).toBe(true);
});
