import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts contains LTC/Litecoin fee context absent from EVM-only baseline", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  expect(src).toMatch(/\bLTC\b|litecoin|ltc-tx-store|ltcTx|UnsignedLtc/i);
});
