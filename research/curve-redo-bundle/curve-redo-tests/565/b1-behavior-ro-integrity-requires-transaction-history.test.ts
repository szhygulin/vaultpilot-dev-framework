import { test, expect } from "vitest";

test("requiresDataSource returns true for get_transaction_history", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  expect(Boolean(mod.requiresDataSource("get_transaction_history"))).toBe(true);
});
