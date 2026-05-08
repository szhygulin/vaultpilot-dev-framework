import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts mentions ETH plus all four extension chain symbols", () => {
  const src = readFileSync(resolve(repo, "src/signing/render-verification.ts"), "utf8");
  const symbols = ["ETH", "TRX", "SOL", "BTC", "LTC"];
  const present = symbols.filter((s) => new RegExp(`\\b${s}\\b`).test(src));
  expect(present.length).toBeGreaterThanOrEqual(5);
});
