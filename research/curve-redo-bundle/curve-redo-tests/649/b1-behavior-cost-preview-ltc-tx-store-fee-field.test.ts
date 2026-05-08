import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("ltc-tx-store declares a string fee field surfaced on the unsigned tx envelope", () => {
  const src = readFileSync(resolve(repo, "src/signing/ltc-tx-store.ts"), "utf8");
  expect(src).toMatch(/fee(?:Native|Ltc|Sat|Sats|Absolute|Total)\s*\??\s*:\s*string/i);
});
