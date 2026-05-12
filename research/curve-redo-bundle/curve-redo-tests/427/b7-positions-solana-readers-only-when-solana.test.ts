// Solana readers gated by solanaWallet.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 positions solana readers only when solana", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/args\.solanaWallet\s*\?\s*\[/);
});
