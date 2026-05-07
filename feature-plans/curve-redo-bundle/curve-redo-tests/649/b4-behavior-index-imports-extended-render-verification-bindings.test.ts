import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("src/index.ts imports more than one cost-preview binding from render-verification (chain dispatch wiring)", () => {
  const src = fs.readFileSync(resolve(repoRoot, "src/index.ts"), "utf8");
  // Either: import line from render-verification mentions chain-specific
  // names beyond renderCostPreviewBlock, OR file references a non-EVM chain
  // unsigned-tx envelope alongside renderCostPreview-style invocation —
  // matching the issue's "Wire into the verification-block render path for
  // each chain" requirement.
  const hasChainSpecificImport = /from\s+["'][^"']*render-verification[^"']*["']/.test(src) &&
    /(?:renderCost\w*(?:Btc|Ltc|Sol|Solana|Tron|Bitcoin|Litecoin)|costPreview\w*(?:Btc|Ltc|Sol|Solana|Tron|Bitcoin|Litecoin))/i.test(src);
  const hasChainContextNearCostPreview = /renderCostPreview[\s\S]{0,800}(?:btc|ltc|solana|tron|bitcoin|litecoin)/i.test(src) ||
    /(?:btc|ltc|solana|tron|bitcoin|litecoin)[\s\S]{0,800}renderCostPreview/i.test(src);
  expect(hasChainSpecificImport || hasChainContextNearCostPreview).toBe(true);
});
