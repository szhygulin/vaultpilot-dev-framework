import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts contains TRON fee context (TRX / tron-tx-store / energy or bandwidth)", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  expect(src).toMatch(/\bTRX\b|\btron\b|tron-tx-store|tronTx|UnsignedTron/i);
});
