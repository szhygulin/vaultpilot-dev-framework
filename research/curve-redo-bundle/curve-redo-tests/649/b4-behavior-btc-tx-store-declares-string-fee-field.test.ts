import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("btc-tx-store source declares a string-typed fee field on the unsigned-tx envelope", () => {
  // Issue: 'PSBT path already computes the absolute fee internally for
  // prepare_btc_send (see fee-rate × vsize); needs to be surfaced as a
  // string field on the unsigned-tx envelope'.
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/btc-tx-store.ts"),
    "utf8",
  );
  expect(src).toMatch(
    /\bfee(?:Native|Btc|Bitcoin|Sats?|Satoshi|Amount|Total|Str|String)\b\s*\??:\s*string/,
  );
});
