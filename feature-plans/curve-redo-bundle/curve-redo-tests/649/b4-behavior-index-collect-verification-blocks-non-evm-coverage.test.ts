import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("collectVerificationBlocks region of src/index.ts covers non-EVM chains for the cost preview", () => {
  const src = fs.readFileSync(resolve(repoRoot, "src/index.ts"), "utf8");
  // Locate collectVerificationBlocks definition / usage and check it sits
  // alongside chain-name references for non-EVM dispatch.
  expect(src).toMatch(/collectVerificationBlocks/);
  // Pull a window around any occurrence and require non-EVM chain names there.
  const idx = src.indexOf("collectVerificationBlocks");
  expect(idx).toBeGreaterThanOrEqual(0);
  const window = src.slice(Math.max(0, idx - 200), Math.min(src.length, idx + 4000));
  expect(window).toMatch(/btc|ltc|solana|tron|bitcoin|litecoin/i);
});
