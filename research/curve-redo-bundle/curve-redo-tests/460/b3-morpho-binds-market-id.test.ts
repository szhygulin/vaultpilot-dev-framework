// Morpho binds marketId.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b3 morpho binds market id", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/morpho/actions.ts"), "utf8");
  expect(src).toMatch(/morpho-blue-market-id["']\s*,\s*p\.marketId/);
});
