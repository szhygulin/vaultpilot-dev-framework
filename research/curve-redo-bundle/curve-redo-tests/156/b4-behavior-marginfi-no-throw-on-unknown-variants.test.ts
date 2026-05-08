import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("the marginfi module contains a try/catch around per-bank decode", async () => {
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
  expect(blob.length).toBeGreaterThan(0);
  // A try/catch on decode is the documented hardening.
  expect(blob).toMatch(/try[\s\S]{0,400}\.decode\(/);
  expect(blob).toMatch(/catch\s*\(/);
});
