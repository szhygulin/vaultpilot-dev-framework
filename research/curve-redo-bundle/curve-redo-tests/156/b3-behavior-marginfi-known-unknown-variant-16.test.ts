import { test, expect } from "vitest";

test("the marginfi module continues to reference oracleSetup variant 16", async () => {
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
  expect(/\b16\b/.test(src)).toBe(true);
});
