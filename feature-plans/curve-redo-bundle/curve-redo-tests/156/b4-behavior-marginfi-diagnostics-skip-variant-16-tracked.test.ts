import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("a recognizable variant-16 marker is present in marginfi sources", async () => {
  const candidates = [
    "src/modules/solana/marginfi.ts",
    "src/modules/positions/marginfi.ts",
    "src/modules/diagnostics/marginfi.ts",
  ];
  let found = false;
  for (const rel of candidates) {
    const p = path.resolve(__dirname, "..", rel);
    try {
      const t = await fs.readFile(p, "utf8");
      if (/\b16\b/.test(t) && /oracle[_]?[Ss]etup|variant|schema/i.test(t)) {
        found = true;
        break;
      }
    } catch {
      // continue
    }
  }
  expect(found).toBe(true);
});
