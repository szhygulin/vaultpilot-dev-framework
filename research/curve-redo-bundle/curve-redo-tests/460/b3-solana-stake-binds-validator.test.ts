// Solana stake binds validator.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 solana stake binds validator", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/solana/native-stake.ts"), "utf8");
  expect(src).toMatch(/solana-validator-vote-pubkey/);
});
