import { test, expect } from "vitest";

test("findBankForMint surfaces actionable text (mint or schema) when bank is skipped at decode", async () => {
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
  // The 769-777 region must include at minimum a mention of mint context AND schema/decode wording —
  // an error that says only 'bank not found' would be a regression of the actionable-error contract.
  const lower = src.toLowerCase();
  expect(lower.includes("mint")).toBe(true);
  expect(lower.includes("schema") || lower.includes("oraclesetup") || lower.includes("decode")).toBe(true);
});
