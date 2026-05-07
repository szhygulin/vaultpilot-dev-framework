import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts mentions all four non-EVM chains targeted by the cost preview extension", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  expect(src).toMatch(/\bBTC\b|bitcoin|\bsats?\b|satoshi/i);
  expect(src).toMatch(/\bLTC\b|litecoin/i);
  expect(src).toMatch(/lamport|\bSOL\b|solana/i);
  expect(src).toMatch(/\bTRX\b|\btron\b/i);
});
