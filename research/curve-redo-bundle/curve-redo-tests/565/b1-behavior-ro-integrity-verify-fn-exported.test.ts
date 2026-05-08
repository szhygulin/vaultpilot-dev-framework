import { test, expect } from "vitest";

test("read-only-integrity exports a verifyDataSource function", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  expect(typeof mod.verifyDataSource).toBe("function");
});
