import { test, expect } from "vitest";

test("ADVISORY_DISCLAIMER is exported as a non-empty string", async () => {
  const mod: any = await import("../src/security/advice-neutrality.js");
  const d = mod.ADVISORY_DISCLAIMER;
  expect(typeof d).toBe("string");
  expect((d as string).length).toBeGreaterThan(0);
});
