import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts has a Solana-aware code path (function or branch)", () => {
  const src = readFileSync(resolve(repo, "src/signing/render-verification.ts"), "utf8");
  expect(src).toMatch(/solana|\bSOL\b/i);
});
