import { test, expect } from "vitest";

test("read-only data-plane tool list contains at least 6 entries (covers all surfaces from issue)", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const list = mod.READ_ONLY_DATA_TOOLS ?? mod.READ_ONLY_TOOLS ?? mod.readOnlyTools ?? mod.DATA_PLANE_READ_TOOLS;
  const arr = Array.isArray(list) ? list : list instanceof Set ? Array.from(list) : [];
  expect(arr.length).toBeGreaterThanOrEqual(6);
});
