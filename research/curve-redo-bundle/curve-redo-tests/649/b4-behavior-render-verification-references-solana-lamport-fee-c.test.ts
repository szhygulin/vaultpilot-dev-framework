import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts contains Solana fee context (lamports / SOL / solana-tx-store)", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  expect(src).toMatch(/lamport|\bSOL\b|solana-tx-store|solanaTx|UnsignedSolana|UnsignedSol/i);
});
