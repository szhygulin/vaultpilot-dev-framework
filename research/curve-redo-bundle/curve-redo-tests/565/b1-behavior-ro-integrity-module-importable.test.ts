import { test, expect } from "vitest";

// Inv #15 introduces a dedicated security module for read-only data-plane
// integrity attestation. Before the fix, this file does not exist and the
// dynamic import throws — fail on baseline.
test("read-only data-plane integrity module is importable", async () => {
  const mod = await import("../src/security/read-only-integrity.js");
  expect(mod).toBeTruthy();
  expect(typeof mod).toBe("object");
});
