// Tron minVersion 0.x.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 tron min 0x", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Tron[\s\S]*?minVersion\s*:\s*["']0\./);
});
