import { test, expect } from "vitest";

test("the marginfi override wraps per-bank decode in try/catch (file-level contract)", async () => {
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
  // The fetchGroupDataOverride documented in the issue MUST contain a try/catch around bank decoding.
  // Without it, one variant-15 bank crashes the whole hydration path.
  expect(/fetchGroupDataOverride/.test(src)).toBe(true);
  expect(/try\s*\{[\s\S]*decode[\s\S]*\}\s*catch/i.test(src)).toBe(true);
});
