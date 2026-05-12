// solana-usb expectedNames Solana.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 solana signer expected", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/solana-usb-signer.ts"), "utf8");
  expect(src).toMatch(/expectedNames\s*:\s*\[\s*["']Solana["']\s*\]/);
});
