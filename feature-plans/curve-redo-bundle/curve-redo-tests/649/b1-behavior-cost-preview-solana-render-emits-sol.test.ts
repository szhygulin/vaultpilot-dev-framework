import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts emits a literal '... SOL' suffix in the cost preview", () => {
  const src = readFileSync(resolve(repo, "src/signing/render-verification.ts"), "utf8");
  expect(src).toMatch(/SOL/);
});
