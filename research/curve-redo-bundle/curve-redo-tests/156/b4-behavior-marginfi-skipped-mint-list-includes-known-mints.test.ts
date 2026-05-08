import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("USDC and USDT canonical mints are referenced in marginfi-related source", async () => {
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
  const candidates = [
    "src/modules/solana/marginfi.ts",
    "src/modules/positions/marginfi.ts",
    "src/config/solana.ts",
  ];
  let blob = "";
  for (const rel of candidates) {
    try {
      blob += await fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
    } catch {
      // continue
    }
  }
  expect(blob).toContain(USDC);
  expect(blob).toContain(USDT);
});
