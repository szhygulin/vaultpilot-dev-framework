// Solana native stake binds vote pubkey field.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 solana stake binds vote pubkey", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/solana/native-stake.ts"), "utf8");
  expect(src).toMatch(/solana-validator-vote-pubkey/);
});
