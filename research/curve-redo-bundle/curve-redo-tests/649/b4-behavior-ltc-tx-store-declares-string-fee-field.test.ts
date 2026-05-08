import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("ltc-tx-store source declares a string-typed fee field on the unsigned-tx envelope", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/ltc-tx-store.ts"),
    "utf8",
  );
  expect(src).toMatch(
    /\bfee(?:Native|Ltc|Litecoin|Sats?|Satoshi|Amount|Total|Str|String)\b\s*\??:\s*string/,
  );
});
