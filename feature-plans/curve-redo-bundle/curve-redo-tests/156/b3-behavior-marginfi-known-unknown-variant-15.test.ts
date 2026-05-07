import { test, expect } from "vitest";

test("the marginfi module references oracleSetup variant 15 (today's new unknown)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const candidates = [
    path.resolve(process.cwd(), "src/modules/solana/marginfi.ts"),
    path.resolve(process.cwd(), "src/modules/solana/marginfi.js"),
  ];
  let src = "";
  for (const p of candidates) {
    if (fs.existsSync(p)) { src = fs.readFileSync(p, "utf8"); break; }
  }
  expect(src.length).toBeGreaterThan(0);
  // Variant 15 must appear as a literal — either in a known-unknown list, a comment, or a fixture.
  // Without it, USDC/USDT skips are not attributed to the documented upstream drift.
  expect(/\b15\b/.test(src)).toBe(true);
});
