// BTC multisig expectedNames Bitcoin.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 btc multisig expected", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/btc/multisig.ts"), "utf8");
  expect(src).toMatch(/expectedNames\s*:\s*\[\s*["']Bitcoin["']\s*\]/);
});
