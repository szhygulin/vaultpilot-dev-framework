// Digest row preserves market.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 digest row market", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/index.ts"), "utf8");
  expect(src).toMatch(/market\s*:\s*a\.market/);
});
