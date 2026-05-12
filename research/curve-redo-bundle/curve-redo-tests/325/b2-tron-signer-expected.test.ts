// tron-usb expectedNames Tron.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 tron signer expected", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/tron-usb-signer.ts"), "utf8");
  expect(src).toMatch(/expectedNames\s*:\s*\[\s*["']Tron["']\s*\]/);
});
