import { test, expect } from "vitest";

test("requiresDataSource returns true for get_market_incident_status", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  expect(Boolean(mod.requiresDataSource("get_market_incident_status"))).toBe(true);
});
