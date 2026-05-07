import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts references TRX token symbol once TRON cost preview lands", () => {
  const src = readFileSync(resolve(repo, "src/signing/render-verification.ts"), "utf8");
  // Baseline EVM-only block uses ETH; TRX must be added when TRON variant ships.
  expect(src).toMatch(/\bTRX\b/);
});
