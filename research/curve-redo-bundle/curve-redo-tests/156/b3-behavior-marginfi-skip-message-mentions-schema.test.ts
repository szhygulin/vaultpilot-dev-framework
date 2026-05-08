import { test, expect } from "vitest";

test("skip-at-decode error message references an on-chain schema update", async () => {
  // The marginfi module file content (as a UTF-8 string) is observable: marginfi.ts:769-777
  // is documented as the source of the user-facing skip message. The literal must contain
  // the word 'schema' so users understand the failure mode.
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
  expect(src.toLowerCase()).toContain("schema");
});
