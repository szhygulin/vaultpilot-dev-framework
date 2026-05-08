import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts still exports a renderCostPreview-style API and adds at least one non-EVM render binding", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  // EVM block survives.
  expect(src).toMatch(/render\w*Cost\w*/);
  // New non-EVM-flavored binding present (function/const declaration whose
  // identifier carries chain context, OR a switch on chain ids that names
  // non-EVM chains).
  const hasNonEvmRenderer = /(?:function|const|let)\s+\w*(?:Btc|Ltc|Sol|Solana|Tron|Bitcoin|Litecoin)\w*/i.test(src) ||
    /(?:case|switch)[\s\S]{0,200}(?:btc|ltc|solana|tron|bitcoin|litecoin)/i.test(src);
  expect(hasNonEvmRenderer).toBe(true);
});
