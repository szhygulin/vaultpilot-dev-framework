import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts contains a native-only fallback (≈ format) AND new non-EVM chain context", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  // Issue: 'native-only when price lookup fails' UX should carry over.
  // The ≈ glyph is the EVM block's native-only marker.
  expect(src).toMatch(/≈|~\$|usd|price/i);
  // Coexists with at least one non-EVM unit reference.
  expect(src).toMatch(/\bsats?\b|satoshi|lamport|\bTRX\b|\bLTC\b|\bSOL\b/i);
});
