// Digest passes solanaWallet.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 digest passes solana", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/index.ts"), "utf8");
  expect(src).toMatch(/solanaWallet\s*:\s*args\.solanaAddress/);
});
