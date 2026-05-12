// BTC multisig mentions Invariant #14.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 btc multisig binding doc", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/btc/multisig.ts"), "utf8");
  expect(src).toMatch(/Invariant\s*#?14|Inv\s*#?14/i);
});
