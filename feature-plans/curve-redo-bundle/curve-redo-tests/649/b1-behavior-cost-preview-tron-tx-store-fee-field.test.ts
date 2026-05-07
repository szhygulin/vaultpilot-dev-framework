import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("tron-tx-store declares a string fee field on the unsigned tx variant", () => {
  const src = readFileSync(resolve(repo, "src/signing/tron-tx-store.ts"), "utf8");
  // feeNative or chain-appropriate name (feeTrx, feeAbsolute, etc.) declared as string.
  expect(src).toMatch(/fee(?:Native|Trx|Burn|Net|Absolute|Total)\s*\??\s*:\s*string/i);
});
