import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("the documented user-facing string lives near findBankForMint", async () => {
  const candidates = [
    "src/modules/solana/marginfi.ts",
    "src/modules/positions/marginfi.ts",
  ];
  let blob = "";
  for (const rel of candidates) {
    try {
      blob += await fs.readFile(path.resolve(__dirname, "..", rel), "utf8");
    } catch {
      // continue
    }
  }
  expect(blob).toMatch(/findBankForMint/);
  // Issue body quotes: "skipped at decode — MarginFi shipped an on-chain schema update"
  expect(blob).toMatch(/MarginFi[\s\S]{0,80}schema update/i);
});
