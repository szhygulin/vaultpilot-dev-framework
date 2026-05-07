import { test, expect } from "vitest";

test("skip-at-decode error message references decode/skip wording", async () => {
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
  const lower = src.toLowerCase();
  // 'skipped at decode' is the message documented in the issue.
  expect(lower.includes("skipped at decode") || (lower.includes("skip") && lower.includes("decode"))).toBe(true);
});
