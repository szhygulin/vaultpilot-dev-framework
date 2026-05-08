import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("fetchGroupDataOverride references tryReadMintFromRawBankData", async () => {
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
  expect(blob).toMatch(/fetchGroupDataOverride/);
  expect(blob).toMatch(/tryReadMintFromRawBankData/);
});
