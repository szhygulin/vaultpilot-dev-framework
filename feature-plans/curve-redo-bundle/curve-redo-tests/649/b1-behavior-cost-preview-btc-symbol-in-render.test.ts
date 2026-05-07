import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts references BTC token symbol once Bitcoin cost preview lands", () => {
  const src = readFileSync(resolve(repo, "src/signing/render-verification.ts"), "utf8");
  expect(src).toMatch(/\bBTC\b/);
});
