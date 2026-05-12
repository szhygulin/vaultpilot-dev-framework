// ltc-usb expectedNames Litecoin.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 ltc signer expected", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/ltc-usb-signer.ts"), "utf8");
  expect(src).toMatch(/expectedNames\s*:\s*\[\s*["']Litecoin["']\s*\]/);
});
