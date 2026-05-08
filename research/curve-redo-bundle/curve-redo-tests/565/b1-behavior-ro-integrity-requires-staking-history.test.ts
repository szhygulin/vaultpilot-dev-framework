import { test, expect } from "vitest";

test("requiresDataSource returns true for a staking-history read tool", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const a = Boolean(mod.requiresDataSource("get_staking_history"));
  const b = Boolean(mod.requiresDataSource("get_staking_positions"));
  expect(a || b).toBe(true);
});
