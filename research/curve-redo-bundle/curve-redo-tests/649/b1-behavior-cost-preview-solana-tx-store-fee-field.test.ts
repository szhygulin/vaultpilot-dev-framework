import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("solana-tx-store declares a string fee field on the unsigned tx variant", () => {
  const src = readFileSync(resolve(repo, "src/signing/solana-tx-store.ts"), "utf8");
  expect(src).toMatch(/fee(?:Native|Sol|Lamports|Absolute|Total)\s*\??\s*:\s*string/i);
});
