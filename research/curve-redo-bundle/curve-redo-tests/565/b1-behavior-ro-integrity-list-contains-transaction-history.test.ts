import { test, expect } from "vitest";

test("read-only data-plane tool list contains get_transaction_history", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const list = mod.READ_ONLY_DATA_TOOLS ?? mod.READ_ONLY_TOOLS ?? mod.readOnlyTools ?? mod.DATA_PLANE_READ_TOOLS;
  const arr = Array.isArray(list) ? list : list instanceof Set ? Array.from(list) : [];
  expect(arr).toContain("get_transaction_history");
});
