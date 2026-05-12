// btc-multisig-cosigner-xpub.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 kind btc cosigner", () => {
  const src = readFileSync(resolve(process.cwd(), "src/security/durable-binding.ts"), "utf8");
  expect(src).toMatch(/["']btc-multisig-cosigner-xpub["']/);
});
