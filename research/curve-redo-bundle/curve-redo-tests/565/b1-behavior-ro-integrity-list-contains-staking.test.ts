import { test, expect } from "vitest";

test("read-only data-plane tool list includes a staking-history read tool", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  const list = mod.READ_ONLY_DATA_TOOLS ?? mod.READ_ONLY_TOOLS ?? mod.readOnlyTools ?? mod.DATA_PLANE_READ_TOOLS;
  const arr = Array.isArray(list) ? list : list instanceof Set ? Array.from(list) : [];
  const hasStaking = arr.some((s: unknown) => typeof s === "string" && /staking/i.test(s));
  expect(hasStaking).toBe(true);
});
