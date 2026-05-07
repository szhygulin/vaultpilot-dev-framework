import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts contains BTC/Bitcoin fee context (sats / BTC unit / vsize) absent from EVM-only baseline", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  // Strong BTC-only signals: explicit BTC unit symbol, sats/satoshi units,
  // or the sat/vB × vsize fee model named in the issue.
  expect(src).toMatch(/\bBTC\b|bitcoin|\bsats?\b|satoshi|vsize|sat\/vB/i);
});
