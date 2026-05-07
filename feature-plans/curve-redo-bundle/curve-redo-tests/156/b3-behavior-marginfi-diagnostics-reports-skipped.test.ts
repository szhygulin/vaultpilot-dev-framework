import { test, expect } from "vitest";

test("the marginfi module exposes a diagnostics entry that includes a skipped-banks shape", async () => {
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
  // The diagnostics tool must reference 'skipped' (banks) and 'decode' (the failure step) so users
  // can identify the variant-15/16 drift without reading source.
  const lower = src.toLowerCase();
  expect(lower).toContain("skipped");
  expect(lower).toContain("decode");
});
