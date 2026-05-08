import { test, expect } from "vitest";

test("read-only-integrity exports a requiresDataSource function", async () => {
  const mod: any = await import("../src/security/read-only-integrity.js");
  expect(typeof mod.requiresDataSource).toBe("function");
});
