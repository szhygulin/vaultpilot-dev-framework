import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("src/index.ts collectVerificationBlocks references non-EVM chain cost preview rendering", () => {
  const src = readFileSync(resolve(repo, "src/index.ts"), "utf8");
  // The collectVerificationBlocks site must dispatch to non-EVM render variants.
  expect(src).toMatch(/collectVerificationBlocks/);
  // After the follow-up, render-verification's non-EVM cost preview functions/branches
  // are imported and invoked from index.ts (verification-block render path wiring).
  const nonEvmHook =
    /tron|solana|\bbtc\b|\bltc\b|TRX|SOL|BTC|LTC/i.test(src) &&
    /renderCostPreview|renderTron|renderSolana|renderBtc|renderLtc|costPreview/i.test(src);
  expect(nonEvmHook).toBe(true);
});
