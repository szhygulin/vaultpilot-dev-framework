// MarginFi binds bank.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 marginfi binds bank", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/solana/marginfi.ts"), "utf8");
  expect(src).toMatch(/marginfi-bank-pubkey/);
});
