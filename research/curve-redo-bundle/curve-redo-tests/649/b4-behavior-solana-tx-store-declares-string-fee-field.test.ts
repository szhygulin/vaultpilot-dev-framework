import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("solana-tx-store source declares a string-typed fee field on the unsigned-tx envelope", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/solana-tx-store.ts"),
    "utf8",
  );
  // 5000 base × signatures + priority fee, denominated in SOL string.
  expect(src).toMatch(
    /\bfee(?:Native|Sol|Solana|Lamports|Amount|Total|Str|String)\b\s*\??:\s*string/,
  );
});
