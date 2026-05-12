// Solana minVersion 1.x.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 solana min 1x", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/Solana[\s\S]*?minVersion\s*:\s*["']1\./);
});
