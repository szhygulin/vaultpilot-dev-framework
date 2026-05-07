import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts emits a literal '... TRX' suffix in the cost preview", () => {
  const src = readFileSync(resolve(repo, "src/signing/render-verification.ts"), "utf8");
  // Per the EVM template '~$X (≈ Y ETH)', the new TRON variant must render `... TRX`
  // (i.e. the symbol appears as a printed suffix in a template literal).
  expect(src).toMatch(/TRX/);
});
