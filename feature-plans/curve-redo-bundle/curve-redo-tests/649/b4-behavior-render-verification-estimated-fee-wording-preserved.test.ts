import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts retains the 'Estimated network fee' wording and pairs it with non-EVM unit context", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  // EVM baseline already has this string; the extension must keep it AND
  // sit alongside non-EVM unit references (sats / lamport / TRX / LTC).
  expect(src).toMatch(/Estimated network fee/);
  expect(src).toMatch(/\bsats?\b|satoshi|lamport|\bTRX\b|\bLTC\b|\bSOL\b/i);
});
