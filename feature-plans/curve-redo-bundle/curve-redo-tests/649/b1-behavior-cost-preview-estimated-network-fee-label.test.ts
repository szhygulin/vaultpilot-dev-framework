import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts contains the 'Estimated network fee' label string", () => {
  const src = readFileSync(resolve(repo, "src/signing/render-verification.ts"), "utf8");
  expect(src).toMatch(/Estimated network fee/);
});
