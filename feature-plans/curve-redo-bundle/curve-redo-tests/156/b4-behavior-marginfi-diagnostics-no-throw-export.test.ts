import { test, expect } from "vitest";

test("importing src/modules/solana/marginfi resolves successfully", async () => {
  await expect(import("../src/modules/solana/marginfi.js")).resolves.toBeDefined();
});
